import { DurableObject } from 'cloudflare:workers';
import { calls, redact, type CallRow, type TranscriptLine } from '../services/calls';
import { telnyx } from '../lib/telnyx';
import { forcedHandoffMessage, missedHandoff } from './handoff';
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
/** Quiet time after the last words before checking for a hand-off the voice model skipped. */
const HANDOFF_QUIET_MS = 1_500;
/** A back-office run that never reports back stops blocking new ones after this long. */
const BACK_OFFICE_STALE_MS = QUESTION_WAIT_MS + 15_000;
const MAX_FORCED_HANDOFFS = 12;

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
  /** Who can be patched into the call (callbay's user), from which number, and where their leg reports. */
  person?: { name: string; phone: string | null; from: string; webhookUrl: string };
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
  /** Back-office bookkeeping for starting it ourselves when the voice model skips a hand-off (handoff.ts). */
  private backOfficeBusy = false;
  private lastHandoffAt = 0;
  private forcedHandoffs = new Set<number>();
  private handoffTimer: ReturnType<typeof setTimeout> | null = null;
  /** The person's own phone leg while it rings or is on the call; the caller stays silent while they talk. */
  private personLeg: string | null = null;
  private personOn = false;
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
      case '/connect-person': {
        const { phone } = (await req.json()) as { phone?: string };
        return Response.json({ message: await this.connectPerson(phone) });
      }
      case '/person-joined':
        await this.personJoined();
        return new Response('ok');
      case '/person-left':
        this.personLeft();
        return new Response('ok');
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
        if (this.endingCall || this.personOn) break;
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
        this.scheduleHandoffCheck();
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
        if (!this.endingCall && !this.personOn) {
          this.appendTranscript('caller', (ev as { delta: string }).delta);
          this.scheduleHandoffCheck();
        }
        break;
      case 'session.delegation.created':
        this.backOfficeBusy = true;
        this.lastHandoffAt = Date.now();
        console.log('delegation', JSON.stringify((ev as { delegation: unknown }).delegation));
        break;
      case 'response.event': {
        const e = ev as { delegation_id: string; event: { type: string; item?: { type: string; call_id: string; name: string; arguments: string } } };
        if (e.event.type === 'response.output_item.done' && e.event.item?.type === 'function_call') {
          console.log('back office call', e.event.item.name, e.event.item.arguments);
          await this.runTool(e.event.item);
        } else if (e.event.type === 'response.completed' || e.event.type === 'response.failed' || e.event.type === 'error') {
          this.backOfficeBusy = false;
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

  // ---- hand-offs the voice model skipped

  private scheduleHandoffCheck(): void {
    if (this.handoffTimer) clearTimeout(this.handoffTimer);
    this.handoffTimer = setTimeout(() => this.checkMissedHandoff(), HANDOFF_QUIET_MS);
  }

  private checkMissedHandoff(): void {
    this.handoffTimer = null;
    if (this.ended || this.endingCall || this.personLeg || this.forcedHandoffs.size >= MAX_FORCED_HANDOFFS) return;
    if (this.backOfficeBusy && Date.now() - this.lastHandoffAt < BACK_OFFICE_STALE_MS) return;
    const miss = missedHandoff(this.transcript, this.lastHandoffAt, this.forcedHandoffs);
    if (!miss) return;
    this.forcedHandoffs.add(miss.line.at);
    this.backOfficeBusy = true;
    this.lastHandoffAt = Date.now();
    this.mark(`no hand-off after ${miss.reason === 'menu' ? 'a phone menu' : 'a spoken promise'}; starting the back office`);
    this.sendLive({ type: 'response.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: forcedHandoffMessage(miss, this.transcript) }] } });
    this.sendLive({ type: 'response.create' });
  }

  // ---- patching the person in (and handing back)

  /** Ring the person's phone; they join the call when they answer (person-joined). Returns what happened. */
  private async connectPerson(phoneOverride?: string): Promise<string> {
    const s = await this.load();
    if (!s?.person || !s.controlId || this.ended) return 'the call is not live';
    if (this.personLeg) return this.personOn ? `${s.person.name} is already on the call` : `already ringing ${s.person.name}`;
    const phone = phoneOverride || s.person.phone;
    if (!phone) return `no phone number for ${s.person.name}; save one with callbay_save_profile or pass phone`;
    const remaining = Math.max(60, s.maxSeconds - Math.round((Date.now() - (this.answeredAt || Date.now())) / 1000));
    try {
      this.personLeg = await telnyx(this.env).dialPerson({ to: phone, from: s.person.from, webhookUrl: s.person.webhookUrl, callId: s.callId, superviseControlId: s.controlId, timeLimitSecs: remaining });
    } catch (err) {
      console.warn('connect person failed', s.callId, String(err));
      this.note(`couldn't ring ${s.person.name}`);
      return `couldn't ring ${s.person.name}: ${String(err).slice(0, 200)}`;
    }
    this.note(`ringing ${s.person.name} to join the call`);
    return `ringing ${s.person.name}; they join as soon as they pick up`;
  }

  private async personJoined(): Promise<void> {
    const s = await this.load();
    this.personOn = true;
    // Anything the caller had queued would play over the person.
    this.sendPhone({ event: 'clear' });
    this.playbackEndsAt = Date.now();
    this.note(`${s?.person?.name ?? 'the person'} joined the call`);
    this.sendLive({
      type: 'session.instructions.append',
      delegation_id: null,
      content: `${s?.person?.name ?? 'The person'} has joined the call and is talking to them directly. Stay completely silent and don't delegate anything. Keep listening; you'll be told when they hand the call back to you.`,
    });
  }

  private personLeft(): void {
    const wasOn = this.personOn;
    this.personOn = false;
    this.personLeg = null;
    if (this.ended || this.endingCall) return;
    this.note(wasOn ? `${this.setup?.person?.name ?? 'the person'} handed the call back` : `${this.setup?.person?.name ?? 'the person'} didn't pick up`);
    this.sendLive({
      type: 'session.instructions.append',
      delegation_id: null,
      content: wasOn
        ? `${this.setup?.person?.name ?? 'The person'} has left the call and handed it back to you. Pick up where they left off: say something short like "Hi, I'm back on for ${this.setup?.person?.name ?? 'them'}", then keep working on the task. If it's already done, say bye and hand off to hang up.`
        : `${this.setup?.person?.name ?? 'The person'} didn't pick up. Carry on with the task yourself.`,
    });
  }

  private note(text: string): void {
    this.transcript.push({ role: 'note', text, at: Date.now() });
    if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flushTranscript(), TRANSCRIPT_FLUSH_MS);
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
    if (this.personOn && item.name !== 'ask_user') {
      this.sendLive({ type: 'response.item.create', item: { type: 'function_call_output', call_id: item.call_id, output: 'the person is on the call; do nothing until they hand it back' } });
      return;
    }
    switch (item.name) {
      case 'connect_person':
        output = await this.connectPerson();
        break;
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
      // While the person is talking the caller stays quiet; the hard stop still comes.
      if (!this.personOn) this.sendLive({ type: 'session.instructions.append', delegation_id: null, content: 'Time is almost up. Wrap up now: get the one thing you still need, say a quick goodbye, and hand off to hang up (end_call).' });
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
    if (this.handoffTimer) clearTimeout(this.handoffTimer);
    console.log('call session ending:', reason);
    const s = await this.load();
    if (s?.controlId && reason !== 'hangup webhook') await telnyx(this.env).hangup(s.controlId).catch((err) => console.warn('hangup', String(err)));
    if (this.personLeg) await telnyx(this.env).hangup(this.personLeg).catch((err) => console.warn('person hangup', String(err)));
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
