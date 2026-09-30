import { DurableObject } from 'cloudflare:workers';
import { Raindrop, type Interaction } from 'raindrop-ai';
import { calls, redact, type CallRow, type TranscriptLine } from '../services/calls';
import { telnyx } from '../lib/telnyx';
import { connectCheckMessage, forcedHandoffMessage, MenuRecovery, missedHandoff } from './handoff';
import { alreadyUnreachable, mergeTranscript, pressedToJoin, unreachableMessage } from './person';
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
 *   /answer     call4me_answer_question; the answer goes straight to the voice model
 *   /hang-up    call4me_hang_up; the hangup webhook finishes and bills the call as usual
 *
 * The person's own phone (person.ts): /connect-person rings it, /person-answered asks them to
 * press 1, /person-gate puts them on the call if they did, /person-left hands the call back.
 */

const OPENAI_LIVE_URL = 'https://api.openai.com/v1/live/sessions';
/** How long ask_user holds the back office for an answer. One that comes later still reaches the caller. */
const QUESTION_WAIT_MS = 120_000;
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
/** A recording may pause between options; allow more quiet before choosing a menu route. */
const MENU_QUIET_MS = 3_000;
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
  /** Who can be patched into the call (call4me's user), from which number, and where their leg reports. */
  person?: { name: string; phone: string | null; from: string; webhookUrl: string; connectWhen?: string | null };
}

type Stored = SessionSetup;

type BackOfficeMonitoring = { interaction: Interaction; output: string[]; startedAt: number; activeTools: number; status?: string };

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
  private menuRecovery = new MenuRecovery();
  private forcedMenus = 0;
  private lastTranscriptAt = 0;
  private handoffTimer: ReturnType<typeof setTimeout> | null = null;
  /** Back-office functions still running (an ask_user waits on the person). Its response already reported completed. */
  private toolsRunning = 0;
  /** ask_user calls waiting on the person, by question id. */
  private waiting = new Map<string, (answer: string) => void>();
  /** The person's own phone leg while it rings or is on the call; the caller stays silent while they talk. */
  private personLeg: string | null = null;
  private personOn = false;
  /** Once they've been rung, the connect condition is settled; lines already checked against it. */
  private personRung = false;
  /** A ring ended without them pressing 1: the caller stops trying to connect them on this call. */
  private personUnreachable = false;
  /** Whether this instance holds the whole transcript (it was set up here, or has read the stored one back). */
  private transcriptComplete = false;
  private connectChecked = new Set<number>();
  /** The teardown in progress, so the hangup webhook can wait for the final transcript write. */
  private closing: Promise<void> | null = null;
  private raindrop: Raindrop | null = null;
  private voiceInteraction: Interaction | null = null;
  private monitoringReady: Promise<void> | null = null;
  private monitoringUserId: string | null = null;
  private backOfficeInteractions = new Map<string, BackOfficeMonitoring>();
  private toolMonitoring = new Map<string, { monitoring: BackOfficeMonitoring; name: string; startedAt: number }>();
  private monitoringError: string | null = null;
  private monitoringQueue: Promise<void> = Promise.resolve();
  private monitoringClosed = false;
  private monitoringFinishes = new Set<Promise<void>>();

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    switch (url.pathname) {
      case '/setup': {
        this.setup = (await req.json()) as Stored;
        this.transcriptComplete = true;
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
      case '/person-answered':
        await this.personAnswered();
        return new Response('ok');
      case '/person-gate': {
        const { status, digits } = (await req.json()) as { status?: string; digits?: string };
        await this.personGate(status, digits);
        return new Response('ok');
      }
      case '/person-left':
        this.personLeft();
        return new Response('ok');
      case '/hang-up':
        return Response.json({ message: await this.hangUpForUser() });
      case '/answer': {
        const { id, question, answer } = (await req.json()) as { id: string; question: string; answer: string };
        this.answerCameIn(id, question, answer);
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
    // Start monitoring alongside the connection, so telemetry never delays live audio.
    if (this.env.RAINDROP_WRITE_KEY && !this.monitoringReady) {
      this.monitoringReady = (async () => {
        const row = await calls(this.env.DB).byId(s.callId);
        if (!row) return;
        this.raindrop = new Raindrop({
          writeKey: this.env.RAINDROP_WRITE_KEY,
          projectId: this.env.RAINDROP_PROJECT_ID,
          redactPii: true,
          useExternalOtel: true,
          bypassOtelForTools: true,
          appGit: false,
          localWorkshopUrl: false,
        });
        this.monitoringUserId = row.account_id;
        this.raindrop.setUserDetails({ userId: row.account_id, traits: {} });
        this.voiceInteraction = this.raindrop.begin({
          eventId: crypto.randomUUID(),
          event: 'callbay_voice_call',
          userId: row.account_id,
          convoId: s.callId,
          model: this.env.VOICE_MODEL || 'gpt-live-1',
          input: redact(s.instructions, s.redact ?? []),
          properties: { direction: row.direction, back_office_model: this.env.BACK_OFFICE_MODEL || 'gpt-5.5' },
        });
      })().catch(() => console.warn('raindrop voice initialization failed', s.callId));
      this.ctx.waitUntil(this.monitoringReady);
    }
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
        const delta = (ev as { delta: string }).delta;
        this.appendTranscript('them', delta);
        if (delta) this.menuRecovery.observe(delta, Date.now());
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
        this.observe(() => this.beginBackOffice((ev as { delegation: { id: string } }).delegation.id));
        break;
      case 'response.event': {
        const e = ev as { delegation_id: string; event: { type: string; item?: { type: string; call_id: string; name: string; arguments: string } } };
        const monitoringId = e.delegation_id || 'back-office';
        this.observe(() => {
          this.beginBackOffice(monitoringId);
          if (e.event.type === 'response.output_item.done' && e.event.item) {
            // Content stays in AI output, where the SDK redacts it, rather than trace attributes.
            this.backOfficeInteractions.get(monitoringId)?.output.push(redact(JSON.stringify(e.event.item), this.setup?.redact ?? []));
          }
        });
        if (e.event.type === 'response.output_item.done' && e.event.item?.type === 'function_call') {
          console.log('back office call', e.event.item.name, e.event.item.arguments);
          this.toolsRunning++;
          const item = e.event.item;
          this.observe(() => {
            const monitoring = this.backOfficeInteractions.get(monitoringId);
            if (monitoring) {
              monitoring.activeTools++;
              this.toolMonitoring.set(item.call_id, { monitoring, name: item.name, startedAt });
            }
          });
          const startedAt = Date.now();
          let toolError: string | undefined;
          try {
            await this.runTool(e.event.item);
          } catch (err) {
            toolError = 'tool execution failed';
            this.observe(() => this.backOfficeInteractions.get(monitoringId)?.output.push(redact(String(err), this.setup?.redact ?? [])));
            throw err;
          } finally {
            this.toolsRunning--;
            this.scheduleHandoffCheck();
            const durationMs = Date.now() - startedAt;
            this.observe(() => {
              const monitoring = this.backOfficeInteractions.get(monitoringId);
              if (!monitoring) return;
              monitoring.activeTools--;
              this.toolMonitoring.delete(item.call_id);
              monitoring.interaction.trackTool({ name: item.name, startTime: startedAt, durationMs, error: toolError });
              this.finishBackOffice(monitoringId);
            });
          }
        } else if (e.event.type === 'response.completed' || e.event.type === 'response.failed' || e.event.type === 'error') {
          this.backOfficeBusy = false;
          this.scheduleHandoffCheck();
          console.log('back office', e.event.type);
          this.observe(() => {
            const monitoring = this.backOfficeInteractions.get(monitoringId);
            if (monitoring) {
              monitoring.status = e.event.type;
              if (e.event.type !== 'response.completed') monitoring.output.push(redact(JSON.stringify(e.event), this.setup?.redact ?? []));
              this.finishBackOffice(monitoringId);
            }
          });
        }
        break;
      }
      case 'error': {
        const e = ev as { error: { code?: string; message: string } };
        console.warn('gpt-live error', e.error.code, e.error.message);
        this.monitoringError = redact(e.error.message, this.setup?.redact ?? []);
        break;
      }
      case 'session.closed':
        await this.shutdown(`live session closed: ${(ev as { reason: string }).reason}`);
        break;
    }
  }

  /** Serialize telemetry only; model messages and tools never await this queue. */
  private observe(operation: () => void): void {
    if (this.monitoringClosed || !this.monitoringReady) return;
    this.monitoringQueue = this.monitoringQueue.then(() => this.monitoringReady).then(() => {
      if (!this.monitoringClosed) operation();
    }).catch(() => console.warn('raindrop tracking failed', this.setup?.callId));
    this.ctx.waitUntil(this.monitoringQueue);
  }

  private beginBackOffice(id: string): void {
    const s = this.setup;
    if (!s || !this.raindrop || !this.monitoringUserId || this.backOfficeInteractions.has(id)) return;
    try {
      const input = `${s.backOffice}\n\nConversation:\n${this.transcript.map((l) => `${l.role}: ${l.text}`).join('\n')}`;
      this.backOfficeInteractions.set(id, {
        interaction: this.raindrop.begin({ eventId: crypto.randomUUID(), event: 'callbay_back_office', userId: this.monitoringUserId, convoId: s.callId, model: this.env.BACK_OFFICE_MODEL || 'gpt-5.5', input: redact(input, s.redact ?? []) }),
        output: [],
        startedAt: Date.now(),
        activeTools: 0,
      });
    } catch {
      console.warn('raindrop back office initialization failed', s.callId);
    }
  }

  private finishBackOffice(id: string): void {
    const monitoring = this.backOfficeInteractions.get(id);
    if (!monitoring?.status || monitoring.activeTools) return;
    this.backOfficeInteractions.delete(id);
    const finish = monitoring.interaction.finish({
      output: monitoring.output.join('\n'),
      properties: { status: monitoring.status, duration_ms: Date.now() - monitoring.startedAt },
    }).catch(() => console.warn('raindrop back office delivery failed', this.setup?.callId));
    this.monitoringFinishes.add(finish);
    this.ctx.waitUntil(finish.finally(() => this.monitoringFinishes.delete(finish)));
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
    if (this.ended || this.endingCall) return;
    if (this.handoffTimer) clearTimeout(this.handoffTimer);
    const quiet = this.menuRecovery.pending() ? MENU_QUIET_MS : HANDOFF_QUIET_MS;
    const remaining = Math.max(0, this.lastTranscriptAt + quiet - Date.now());
    this.handoffTimer = setTimeout(() => this.checkMissedHandoff(), remaining);
  }

  private checkMissedHandoff(): void {
    this.handoffTimer = null;
    if (this.ended || this.endingCall || this.personLeg || this.forcedHandoffs.size + this.forcedMenus >= MAX_FORCED_HANDOFFS) return;
    // A running function still owes the back office its output; GPT-Live rejects a new response until then.
    if (this.toolsRunning || (this.backOfficeBusy && Date.now() - this.lastHandoffAt < BACK_OFFICE_STALE_MS)) return;
    const menu = this.menuRecovery.pending();
    const miss = menu ?? missedHandoff(this.transcript, this.lastHandoffAt, this.forcedHandoffs);
    if (!miss) {
      this.checkConnectCondition();
      return;
    }
    if (menu) {
      this.menuRecovery.checked(menu.snapshot);
      this.forcedMenus++;
    } else this.forcedHandoffs.add(miss.line.at);
    this.backOfficeBusy = true;
    this.lastHandoffAt = Date.now();
    this.mark(`no hand-off after ${miss.reason === 'promise' ? 'a spoken promise' : 'a phone menu'}; starting the back office`);
    this.sendLive({ type: 'response.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: forcedHandoffMessage(miss, this.transcript, this.menuRecovery.history()) }] } });
    this.sendLive({ type: 'response.create' });
  }

  // ---- patching the person in (and handing back)

  private checkConnectCondition(): void {
    const person = this.setup?.person;
    const last = this.transcript[this.transcript.length - 1];
    if (!person?.connectWhen || this.personRung || last?.role !== 'them' || this.connectChecked.has(last.at)) return;
    this.connectChecked.add(last.at);
    this.backOfficeBusy = true;
    this.lastHandoffAt = Date.now();
    this.sendLive({ type: 'response.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: connectCheckMessage(person.connectWhen, person.name, this.transcript) }] } });
    this.sendLive({ type: 'response.create' });
  }

  /** Ring the person's phone; they join once they answer and press 1 (person-gate). Returns what happened. */
  private async connectPerson(phoneOverride?: string): Promise<string> {
    const s = await this.load();
    if (!s?.person || !s.controlId || this.ended) return 'the call is not live';
    if (this.personLeg) return this.personOn ? `${s.person.name} is already on the call` : `already ringing ${s.person.name}`;
    const phone = phoneOverride || s.person.phone;
    if (!phone) return `no phone number for ${s.person.name}; save one with call4me_save_profile or pass phone`;
    const remaining = Math.max(60, s.maxSeconds - Math.round((Date.now() - (this.answeredAt || Date.now())) / 1000));
    try {
      this.personLeg = await telnyx(this.env).dialPerson({ to: phone, from: s.person.from, webhookUrl: s.person.webhookUrl, callId: s.callId, superviseControlId: s.controlId, timeLimitSecs: remaining });
    } catch (err) {
      console.warn('connect person failed', s.callId, String(err));
      this.note(`couldn't ring ${s.person.name}`);
      return `couldn't ring ${s.person.name}: ${String(err).slice(0, 200)}`;
    }
    this.personRung = true;
    this.note(`ringing ${s.person.name} to join the call`);
    return `ringing ${s.person.name}; they join once they pick up and press 1`;
  }

  /** Their phone answered, which a voicemail also does: they stay listen-only until they press 1. */
  private async personAnswered(): Promise<void> {
    const s = await this.load();
    if (!s?.person || !this.personLeg || this.ended) return;
    const row = await calls(this.env.DB).byId(s.callId);
    try {
      await telnyx(this.env).joinGate(this.personLeg, { callId: s.callId, business: row?.business ?? 'the business' });
    } catch (err) {
      console.warn('join prompt failed', s.callId, String(err));
      await telnyx(this.env).hangup(this.personLeg).catch((e) => console.warn('person hangup', String(e)));
    }
  }

  private async personGate(status: string | undefined, digits: string | undefined): Promise<void> {
    const s = await this.load();
    if (!this.personLeg || this.personOn || this.ended) return;
    const leg = this.personLeg;
    if (!pressedToJoin(status, digits)) {
      // Voicemail, silence or a wrong key: hang up their leg; person-left tells the caller.
      console.log('join prompt ended without a 1', s?.callId, status);
      await telnyx(this.env).hangup(leg).catch((err) => console.warn('person hangup', String(err)));
      return;
    }
    try {
      await telnyx(this.env).switchSupervisorRole(leg, 'barge');
    } catch (err) {
      console.warn('switch to barge failed', s?.callId, String(err));
      await telnyx(this.env).hangup(leg).catch((e) => console.warn('person hangup', String(e)));
      return;
    }
    await this.personJoined();
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
    if (!wasOn) this.personUnreachable = true;
    if (this.ended || this.endingCall) return;
    const name = this.setup?.person?.name ?? 'the person';
    this.note(wasOn ? `${name} handed the call back` : `${name} didn't join (no answer or voicemail)`);
    this.sendLive({
      type: 'session.instructions.append',
      delegation_id: null,
      content: wasOn
        ? `${name} has left the call and handed it back to you. Pick up where they left off: say something short like "Hi, I'm back on for ${name}", then keep working on the task. If it's already done, say bye and hand off to hang up.`
        : unreachableMessage(name),
    });
  }

  /** call4me_hang_up: the user ends the call from their agent. */
  private async hangUpForUser(): Promise<string> {
    const s = await this.load();
    if (!s?.controlId || this.ended) return 'the call is not live';
    this.note('the call was ended by the user');
    await this.hangup();
    return 'hung up';
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
      const output = 'the person is on the call; do nothing until they hand it back';
      this.observe(() => this.toolMonitoring.get(item.call_id)?.monitoring.output.push(output));
      this.sendLive({ type: 'response.item.create', item: { type: 'function_call_output', call_id: item.call_id, output } });
      return;
    }
    switch (item.name) {
      case 'connect_person':
        // call4me_connect_me (the user asking) can still ring them; the caller can't keep retrying.
        output = this.personUnreachable ? alreadyUnreachable(s.person?.name ?? 'the person') : await this.connectPerson();
        break;
      case 'end_call':
        output = await this.endCall(s, args);
        break;
      case 'ask_user':
        output = await this.askUser(s, String(args.question ?? '').slice(0, 1000));
        break;
      case 'press_digits': {
        const digits = String(args.digits ?? '').replace(/[^0-9*#wW]/g, '').slice(0, 32);
        output = 'no valid digits';
        if (digits && !s.controlId) output = 'no phone connection; keypad input was not submitted';
        if (digits && s.controlId) {
          const snapshot = this.menuRecovery.snapshot();
          await telnyx(this.env).sendDtmf(s.controlId, digits);
          this.menuRecovery.submitted(digits, snapshot);
          output = `keypad submitted: ${digits}; wait for the next prompt to confirm it worked`;
        }
        break;
      }
      default:
        output = `unknown tool ${item.name}`;
    }
    this.observe(() => this.toolMonitoring.get(item.call_id)?.monitoring.output.push(redact(output, s.redact ?? [])));
    this.sendLive({ type: 'response.item.create', item: { type: 'function_call_output', call_id: item.call_id, output } });
    if (item.name !== 'end_call') {
      // The tool result starts another backend response. Recovery must wait for it too.
      this.backOfficeBusy = true;
      this.lastHandoffAt = Date.now();
      this.sendLive({ type: 'response.create' });
    }
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
    const answer = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), QUESTION_WAIT_MS);
      this.waiting.set(qid, (a) => {
        clearTimeout(timer);
        resolve(a);
      });
    });
    this.waiting.delete(qid);
    return answer === null
      ? 'No answer came in time. Tell them you will check and call back about that, and carry on with anything else. If it comes in later, the caller is told directly.'
      : `Answer: ${answer} (the caller has already been given it to say)`;
  }

  /**
   * The person answered an ask_user question. The back office only hears it as a function result,
   * and only while ask_user is still waiting (a one-time code answered at 65s was dropped while the
   * caller kept saying "I don't see it yet"). So the answer goes to the voice model itself as
   * commentary, GPT-Live's channel for information the model should speak aloud, whenever it lands.
   */
  private answerCameIn(id: string, question: string, answer: string): void {
    if (this.ended) return;
    if (!this.personOn) {
      this.sendLive({ type: 'session.commentary.append', delegation_id: null, content: `The answer came back for "${question.slice(0, 300)}": ${answer}. Say it to them now.` });
    }
    this.waiting.get(id)?.(answer);
  }

  private hangup(): Promise<void> {
    return this.shutdown('hung up');
  }

  // ---- transcript

  private appendTranscript(role: TranscriptLine['role'], delta: string): void {
    if (!delta) return;
    this.lastTranscriptAt = Date.now();
    const last = this.transcript[this.transcript.length - 1];
    if (last && last.role === role) last.text += delta;
    else this.transcript.push({ role, text: delta.trimStart(), at: Date.now() });
    if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flushTranscript(), TRANSCRIPT_FLUSH_MS);
  }

  private async flushTranscript(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const s = await this.load();
    if (!s || !this.transcript.length) return;
    const db = calls(this.env.DB);
    if (!this.transcriptComplete) {
      // This instance restarted mid-call: keep what the previous one stored instead of overwriting it.
      const row = await db.byId(s.callId);
      this.transcript = mergeTranscript(row?.transcript ? (JSON.parse(row.transcript) as TranscriptLine[]) : [], this.transcript);
      this.transcriptComplete = true;
    }
    await db.saveTranscript(s.callId, this.transcript.map((l) => ({ ...l, text: redact(l.text.trim(), s.redact ?? []) })));
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
    this.monitoringError = redact(error, this.setup?.redact ?? []);
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
    // Protect all terminal event deliveries with the Durable Object's request lifetime.
    this.ctx.waitUntil((async () => {
      await this.monitoringReady;
      await this.monitoringQueue;
      this.monitoringClosed = true;
      if (!this.raindrop) return;
      for (const tool of this.toolMonitoring.values()) {
        tool.monitoring.interaction.trackTool({ name: tool.name, startTime: tool.startedAt, durationMs: Date.now() - tool.startedAt, error: 'interrupted by call end' });
      }
      for (const [id, monitoring] of this.backOfficeInteractions) {
        monitoring.status = 'interrupted';
        monitoring.activeTools = 0;
        this.finishBackOffice(id);
      }
      this.toolMonitoring.clear();
      await Promise.allSettled(this.monitoringFinishes);
      await this.voiceInteraction?.finish({
        output: [...this.transcript.map((l) => `${l.role}: ${redact(l.text.trim(), s?.redact ?? [])}`), ...(this.monitoringError ? [`Error: ${this.monitoringError}`] : [])].join('\n'),
        properties: { status: this.monitoringError ? 'error' : 'completed', duration_ms: this.answeredAt ? Date.now() - this.answeredAt : 0, frames_in: this.framesIn, frames_out: this.framesOut },
      });
      await this.raindrop.close();
    })().catch(() => console.warn('raindrop voice delivery failed', s?.callId)));
  }
}

/** The durable object for a call id; placed near Telnyx's and OpenAI's US regions. */
export function sessionFor(env: Env, callId: string): DurableObjectStub<CallSession> {
  return env.CALL_SESSION.get(env.CALL_SESSION.idFromName(callId), { locationHint: 'enam' });
}

export type { CallRow };
