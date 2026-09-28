import { DurableObject } from 'cloudflare:workers';
import { calls, redact, type CallRow, type TranscriptLine } from '../services/calls';
import { telnyx } from '../lib/telnyx';
import { BACK_OFFICE_TOOLS } from './prompt';

/**
 * One live phone call: Telnyx's media stream on one side, a GPT-Live session on the other.
 * Both speak G.711 u-law at 8 kHz, so audio is relayed as-is in both directions.
 *
 * Lifecycle:
 *   /setup      the worker stores the call's instructions before dialing or answering
 *   /stream     Telnyx connects its media WebSocket (audio flows once the call is answered)
 *   /answered   the call.answered webhook; GPT-Live starts here, not at dial time, so it
 *               never hears ringback
 *   /ended      the call.hangup webhook; close everything
 *
 * GPT-Live's back office (a Responses model with end_call / ask_user / press_digits)
 * runs our functions; we answer them over the same socket.
 */

const OPENAI_LIVE_URL = 'https://api.openai.com/v1/live/sessions';
const QUESTION_WAIT_MS = 60_000;
const QUESTION_POLL_MS = 1_000;
/** The other side usually speaks first ("Hi, thanks for calling..."). If they don't, nudge. */
const SILENT_PICKUP_MS = 5_000;
const TRANSCRIPT_FLUSH_MS = 2_000;
/** Pickup-to-session-start budget, and how long a call may stay silent both ways before it is abandoned. */
const SESSION_START_LIMIT_MS = 10_000;
const SILENCE_LIMIT_MS = 30_000;
/** After end_call, let the goodbye finish playing before hanging up. */
const HANGUP_GRACE_MS = 700;

export interface SessionSetup {
  callId: string;
  instructions: string;
  backOffice: string;
  voice: string;
  maxSeconds: number;
  pricePerMinuteCents: number;
  /** Telnyx's id for the phone leg: known up front for inbound calls, after dialing for outbound. */
  controlId?: string;
  /** Per-call secrets (account PINs) to mask in the stored transcript. */
  redact?: string[];
}

type Stored = SessionSetup;

type LiveEvent =
  | { type: 'session.started'; session: { id: string } }
  | { type: 'session.output_audio.delta'; delta: string; start_ms: number; end_ms: number }
  | { type: 'session.input_transcript.delta'; delta: string }
  | { type: 'session.output_transcript.delta'; delta: string }
  | { type: 'session.delegation.created'; delegation: { id: string; target: string } }
  | { type: 'response.event'; delegation_id: string; event: { type: string; item?: { type: string; call_id: string; name: string; arguments: string } } }
  | { type: 'session.closed'; reason: string; usage?: { seconds: number } }
  | { type: 'error'; error: { code?: string; message: string } }
  | { type: string };

type TelnyxFrame =
  | { event: 'connected' }
  | { event: 'start'; stream_id: string; start?: { call_control_id?: string } }
  | { event: 'media'; media: { track?: string; payload: string } }
  | { event: 'dtmf'; dtmf?: { digit: string } }
  | { event: 'stop' }
  | { event: string };

export class CallSession extends DurableObject<Env> {
  private setup: Stored | null = null;
  private phone: WebSocket | null = null;
  private live: WebSocket | null = null;
  private liveReady = false;
  private answered = false;
  /** When each milestone happened, logged as one line per step so a broken call shows where it stopped. */
  private answeredAt = 0;
  private liveStartedAt = 0;
  private framesIn = 0;
  private framesOut = 0;
  private ended = false;
  private pendingAudio: string[] = [];
  private transcript: TranscriptLine[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private heardThem = false;
  /** Wall-clock time when the audio already sent to Telnyx will finish playing. */
  private playbackEndsAt = 0;
  private lastOutputAt = 0;
  private endingCall = false;
  /** The teardown in progress, so the hangup webhook can wait for the final transcript write. */
  private closing: Promise<void> | null = null;

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    switch (url.pathname) {
      case '/setup': {
        this.setup = (await req.json()) as Stored;
        await this.ctx.storage.put('setup', this.setup);
        return new Response('ok');
      }
      case '/control': {
        const { controlId } = (await req.json()) as { controlId: string };
        const s = await this.load();
        if (s) {
          s.controlId = controlId;
          await this.ctx.storage.put('setup', s);
        }
        return new Response('ok');
      }
      case '/stream':
        return this.acceptStream(req);
      case '/answered': {
        this.answered = true;
        this.answeredAt = Date.now();
        this.mark('answered');
        this.startWatchdog();
        await this.startLive();
        return new Response('ok');
      }
      case '/ended': {
        await this.shutdown('hangup webhook');
        return new Response('ok');
      }
      default:
        return new Response('not found', { status: 404 });
    }
  }

  private async load(): Promise<Stored | null> {
    if (!this.setup) this.setup = (await this.ctx.storage.get<Stored>('setup')) ?? null;
    return this.setup;
  }

  // ---- Telnyx side

  private async acceptStream(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.phone = server;
    server.addEventListener('message', (ev) => this.onPhoneFrame(typeof ev.data === 'string' ? ev.data : ''));
    server.addEventListener('close', () => void this.shutdown('media stream closed'));
    server.addEventListener('error', () => void this.shutdown('media stream error'));
    // Inbound calls are answered with the stream attached, so the stream itself means "answered".
    if (this.answered) await this.startLive();
    return new Response(null, { status: 101, webSocket: client });
  }

  private onPhoneFrame(raw: string): void {
    let frame: TelnyxFrame;
    try {
      frame = JSON.parse(raw) as TelnyxFrame;
    } catch {
      return;
    }
    if (frame.event === 'media') {
      const payload = (frame as { media: { payload: string } }).media.payload;
      if (!this.answered) return; // ringback and early media are not the other person
      if (this.framesIn++ === 0) this.mark('first audio from phone');
      if (this.liveReady) this.sendLive({ type: 'session.input_audio.append', audio: payload });
      else if (this.pendingAudio.length < 250) this.pendingAudio.push(payload); // ~5s at 20ms frames
    } else if (frame.event === 'stop') {
      void this.shutdown('media stream stopped');
    }
  }

  private sendPhone(msg: unknown): void {
    if (this.phone?.readyState === WebSocket.OPEN) this.phone.send(JSON.stringify(msg));
  }

  // ---- GPT-Live side

  private async startLive(): Promise<void> {
    const s = await this.load();
    if (!s || this.live || this.ended || !this.phone) return;
    this.mark('live connecting');
    const res = await fetch(OPENAI_LIVE_URL, { headers: { upgrade: 'websocket', authorization: `Bearer ${this.env.OPENAI_API_KEY}` } });
    this.mark(`live connect ${res.status}`);
    const ws = res.webSocket;
    if (!ws) {
      const why = `could not open GPT-Live: ${res.status} ${(await res.text()).slice(0, 300)}`;
      console.error(why);
      await this.fail(why);
      return;
    }
    ws.accept();
    this.live = ws;
    ws.addEventListener('message', (ev) => void this.onLive(typeof ev.data === 'string' ? ev.data : ''));
    ws.addEventListener('close', () => void this.shutdown('live session closed'));
    ws.addEventListener('error', () => void this.shutdown('live session error'));
    this.sendLive({
      type: 'session.start',
      session: {
        model: this.env.VOICE_MODEL || 'gpt-live-1',
        instructions: s.instructions,
        audio: { format: { type: 'audio/pcmu', rate: 8000 }, output: { voice: s.voice } },
        delegation: {
          type: 'responses',
          responses: {
            model: this.env.BACK_OFFICE_MODEL || 'gpt-5.5',
            instructions: s.backOffice,
            tools: BACK_OFFICE_TOOLS,
            tool_choice: 'auto',
            parallel_tool_calls: false,
            reasoning: { effort: 'low' },
            text: { verbosity: 'low' },
          },
        },
      },
    });
    // Hard stop a little before Telnyx's own time limit, with a heads-up to wrap up first.
    const wrapAt = Math.max(30, s.maxSeconds - 45) * 1000;
    await this.ctx.storage.setAlarm(Date.now() + wrapAt);
  }

  private sendLive(msg: unknown): void {
    if (this.live?.readyState === WebSocket.OPEN) this.live.send(JSON.stringify(msg));
  }

  private async onLive(raw: string): Promise<void> {
    let ev: LiveEvent;
    try {
      ev = JSON.parse(raw) as LiveEvent;
    } catch {
      return;
    }
    switch (ev.type) {
      case 'session.started': {
        this.liveReady = true;
        this.liveStartedAt = Date.now();
        this.mark(`live session started, flushing ${this.pendingAudio.length} buffered frames`);
        for (const a of this.pendingAudio) this.sendLive({ type: 'session.input_audio.append', audio: a });
        this.pendingAudio = [];
        setTimeout(() => {
          if (!this.heardThem && !this.ended) this.sendLive({ type: 'session.instructions.append', delegation_id: null, content: 'Nobody has spoken since the call connected. Say a short "Hi, hello?" and then wait.' });
        }, SILENT_PICKUP_MS);
        break;
      }
      case 'session.output_audio.delta': {
        // After the hang-up hand-off the goodbye has already been said; anything more is
        // the model filling the silence before the line drops, so it never reaches the phone.
        if (this.endingCall) break;
        const e = ev as { delta: string; start_ms: number; end_ms: number };
        if (this.framesOut++ === 0) this.mark('first caller audio');
        this.sendPhone({ event: 'media', media: { payload: e.delta } });
        const now = Date.now();
        this.playbackEndsAt = Math.max(this.playbackEndsAt, now) + Math.max(0, e.end_ms - e.start_ms);
        this.lastOutputAt = now;
        break;
      }
      case 'session.input_transcript.delta': {
        if (!this.heardThem) this.mark('first words from them');
        this.heardThem = true;
        this.appendTranscript('them', (ev as { delta: string }).delta);
        // Barge-in: GPT-Live stops generating when talked over, but audio already queued at
        // Telnyx keeps playing. If the model has gone quiet while playback is still ahead,
        // that queued audio is stale: flush it.
        const now = Date.now();
        if (now - this.lastOutputAt > 400 && this.playbackEndsAt - now > 300) {
          this.sendPhone({ event: 'clear' });
          this.playbackEndsAt = now;
        }
        break;
      }
      case 'session.output_transcript.delta':
        if (!this.endingCall) this.appendTranscript('caller', (ev as { delta: string }).delta);
        break;
      case 'session.delegation.created':
        console.log('delegation', JSON.stringify((ev as { delegation: unknown }).delegation));
        break;
      case 'response.event': {
        const e = ev as { delegation_id: string; event: { type: string; item?: { type: string; call_id: string; name: string; arguments: string } } };
        if (e.event.type === 'response.output_item.done' && e.event.item?.type === 'function_call') {
          console.log('back office call', e.event.item.name, e.event.item.arguments);
          await this.runTool(e.event.item);
        } else if (e.event.type === 'response.completed' || e.event.type === 'response.failed' || e.event.type === 'error') {
          console.log('back office', e.event.type);
        }
        break;
      }
      case 'error': {
        const e = ev as { error: { code?: string; message: string } };
        console.warn('gpt-live error', e.error.code, e.error.message);
        break;
      }
      case 'session.closed':
        await this.shutdown(`live session closed: ${(ev as { reason: string }).reason}`);
        break;
    }
  }

  // ---- health

  private mark(step: string): void {
    const since = this.answeredAt ? `+${Date.now() - this.answeredAt}ms after answer` : 'before answer';
    console.log(`call ${this.setup?.callId ?? '?'}: ${step} (${since})`);
  }

  /**
   * A call must never sit silent on someone's line. If the voice session hasn't started soon
   * after pickup, or nothing has been said in either direction a while later, hang up and mark
   * the call failed (failed calls are not billed).
   */
  private startWatchdog(): void {
    setTimeout(() => {
      if (!this.ended && !this.liveStartedAt) void this.fail(`voice session did not start within ${SESSION_START_LIMIT_MS / 1000}s of pickup (frames from phone: ${this.framesIn})`);
    }, SESSION_START_LIMIT_MS);
    setTimeout(() => {
      if (!this.ended && this.framesOut === 0 && !this.heardThem) void this.fail(`no audio either way ${SILENCE_LIMIT_MS / 1000}s after pickup (frames from phone: ${this.framesIn}, session started: ${Boolean(this.liveStartedAt)})`);
    }, SILENCE_LIMIT_MS);
  }

  // ---- back-office functions

  private async runTool(item: { call_id: string; name: string; arguments: string }): Promise<void> {
    const s = await this.load();
    if (!s) return;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(item.arguments || '{}') as Record<string, unknown>;
    } catch {
      // leave empty; each tool validates what it needs
    }
    let output: string;
    switch (item.name) {
      case 'end_call':
        output = await this.endCall(s, args);
        break;
      case 'ask_user':
        output = await this.askUser(s, String(args.question ?? '').slice(0, 1000));
        break;
      case 'press_digits': {
        const digits = String(args.digits ?? '').replace(/[^0-9*#wW]/g, '').slice(0, 32);
        if (digits && s.controlId) await telnyx(this.env).sendDtmf(s.controlId, digits);
        output = digits ? `pressed ${digits}` : 'no valid digits';
        break;
      }
      default:
        output = `unknown tool ${item.name}`;
    }
    this.sendLive({ type: 'response.item.create', item: { type: 'function_call_output', call_id: item.call_id, output } });
    if (item.name !== 'end_call') this.sendLive({ type: 'response.create' });
  }

  private async endCall(s: Stored, args: Record<string, unknown>): Promise<string> {
    if (this.endingCall) return 'already hanging up';
    this.endingCall = true;
    if (args.do_not_call === true) {
      const db = calls(this.env.DB);
      const row = await db.byId(s.callId);
      if (row) await db.block(row.to_number, `asked not to be called (${s.callId})`);
    }
    // Let the goodbye finish, then hang up. The hangup webhook bills and writes the recap.
    const wait = Math.max(0, this.playbackEndsAt - Date.now()) + HANGUP_GRACE_MS;
    setTimeout(() => void this.hangup(), wait);
    return 'hanging up';
  }

  private async askUser(s: Stored, question: string): Promise<string> {
    if (!question) return 'no question given';
    const db = calls(this.env.DB);
    const qid = await db.ask(s.callId, question);
    const deadline = Date.now() + QUESTION_WAIT_MS;
    while (Date.now() < deadline && !this.ended) {
      await new Promise((r) => setTimeout(r, QUESTION_POLL_MS));
      const q = (await db.questions(s.callId)).find((x) => x.id === qid);
      if (q?.answer) return `Answer: ${q.answer}`;
    }
    return 'No answer came in time. Tell them you will check and call back about that, and carry on with anything else.';
  }

  private hangup(): Promise<void> {
    return this.shutdown('hung up');
  }

  // ---- transcript

  private appendTranscript(role: TranscriptLine['role'], delta: string): void {
    if (!delta) return;
    const last = this.transcript[this.transcript.length - 1];
    if (last && last.role === role) last.text += delta;
    else this.transcript.push({ role, text: delta.trimStart(), at: Date.now() });
    if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flushTranscript(), TRANSCRIPT_FLUSH_MS);
  }

  private async flushTranscript(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const s = await this.load();
    if (s && this.transcript.length) await calls(this.env.DB).saveTranscript(s.callId, this.transcript.map((l) => ({ ...l, text: redact(l.text.trim(), s.redact ?? []) })));
  }

  // ---- time limit

  async alarm(): Promise<void> {
    const s = await this.load();
    if (!s || this.ended) return;
    if (!(await this.ctx.storage.get('warned'))) {
      await this.ctx.storage.put('warned', true);
      this.sendLive({ type: 'session.instructions.append', delegation_id: null, content: 'Time is almost up. Wrap up now: get the one thing you still need, say a quick goodbye, and hand off to hang up (end_call).' });
      await this.ctx.storage.setAlarm(Date.now() + 40_000);
      return;
    }
    await this.hangup();
  }

  // ---- teardown

  private async fail(error: string): Promise<void> {
    const s = await this.load();
    if (s) await calls(this.env.DB).finish(s.callId, { status: 'failed', error, pricePerMinuteCents: s.pricePerMinuteCents });
    await this.shutdown(error);
  }

  /** Close both sockets and make sure the phone leg is down too (a no-op if it already is). */
  private shutdown(reason: string): Promise<void> {
    this.closing ??= this.teardown(reason);
    return this.closing;
  }

  private async teardown(reason: string): Promise<void> {
    this.ended = true;
    console.log('call session ending:', reason);
    const s = await this.load();
    if (s?.controlId && reason !== 'hangup webhook') await telnyx(this.env).hangup(s.controlId).catch((err) => console.warn('hangup', String(err)));
    await this.flushTranscript().catch((err) => console.warn('transcript flush', String(err)));
    if (this.live?.readyState === WebSocket.OPEN) {
      this.sendLive({ type: 'session.close' });
      setTimeout(() => this.live?.close(1000, 'call ended'), 1000);
    }
    if (this.phone?.readyState === WebSocket.OPEN) this.phone.close(1000, 'call ended');
    await this.ctx.storage.deleteAlarm();
  }
}

/** The durable object for a call id; placed near Telnyx's and OpenAI's US regions. */
export function sessionFor(env: Env, callId: string): DurableObjectStub<CallSession> {
  return env.CALL_SESSION.get(env.CALL_SESSION.idFromName(callId), { locationHint: 'enam' });
}

export type { CallRow };
