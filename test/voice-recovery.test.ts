import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { d1 } from './sqlite-d1';
import { machineEventOf } from '../src/server/voice/voicemail';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') {
      const module = 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }';
      return { url: `data:text/javascript,${encodeURIComponent(module)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { VoiceSession } = await import('../src/server/voice/session');

class Socket extends EventTarget {
  static OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  accept() {}
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  message(value: unknown) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value: JSON.stringify(value) });
    this.dispatchEvent(event);
  }
}
Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => { values.set(key, value); },
    delete: async (keys: string | string[]) => { for (const key of typeof keys === 'string' ? [keys] : keys) values.delete(key); },
    deleteAll: async () => { values.clear(); },
    setAlarm: async (at: number) => { values.set('alarm', at); },
    deleteAlarm: async () => { values.delete('alarm'); },
  };
  const env = { DB: d1(), OPENAI_API_KEY: 'test-key' } as any;
  const session = new VoiceSession({ storage, waitUntil() {} } as any, env) as any;
  session.setup = { callId: 'recovery_test', instructions: 'Test instructions', backOffice: 'Test tools', voice: 'marin', maxSeconds: 1200, redact: [] };
  session.answered = true;
  session.answeredAt = Date.now();
  session.transcriptComplete = true;
  const phone = new Socket();
  session.attachPhone(phone);
  const opens: { socket: Socket; response: ReturnType<typeof deferred<Response>> }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    assert.equal(String(input), 'https://api.openai.com/v1/live/sessions');
    const open = { socket: new Socket(), response: deferred<Response>() };
    opens.push(open);
    return open.response.promise;
  });
  const connected = (index: number) => {
    opens[index].response.resolve({ status: 101, webSocket: opens[index].socket } as any);
    return opens[index].socket;
  };
  const untilOpened = async (count: number) => {
    for (let i = 0; i < 50 && opens.length < count; i++) await Promise.resolve();
    assert.equal(opens.length, count);
  };
  return { session, phone, opens, connected, untilOpened, values, storage, env };
}

test('a phone lost during model connection cannot install an orphan session; a fresh phone carries audio both ways', async (t) => {
  const h = harness(t);
  const first = h.session.startLive();
  await h.untilOpened(1);
  h.phone.message({ event: 'media', media: { payload: 'old-audio' } });
  await h.session.phoneLost(h.phone, 'test loss during connect');
  const orphan = h.connected(0);
  await first;
  assert.equal(orphan.readyState, 3);
  assert.equal(h.session.live, null);
  assert.deepEqual(orphan.sent, []);

  const replacement = new Socket();
  h.session.attachPhone(replacement);
  replacement.message({ event: 'media', media: { payload: 'fresh-audio' } });
  const next = h.session.streamAttached(replacement);
  await h.untilOpened(2);
  const live = h.connected(1);
  await next;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'replacement' } }));
  assert.deepEqual(live.sent.filter((m) => m.type === 'session.input_audio.append'), [{ type: 'session.input_audio.append', audio: 'fresh-audio' }]);
  live.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  assert.deepEqual(replacement.sent, [{ event: 'media', media: { payload: 'AAAA' } }]);
  assert.equal(h.session.ended, false);
  assert.equal(h.values.has('orphanSince'), false);
});

test('a phone stream replaced while the voice session opens is served by that session', async (t) => {
  const h = harness(t);
  const first = h.session.startLive();
  await h.untilOpened(1);
  const replacement = new Socket();
  h.session.attachPhone(replacement);
  const next = h.session.startLive();
  assert.equal(first, next, 'connection work stays serialized');
  const live = h.connected(0);
  await next;
  assert.equal(h.opens.length, 1);
  assert.equal(h.session.live, live);
  assert.equal(h.session.ended, false);
  assert.equal(live.sent[0].type, 'session.start');
});

test("a replaced phone stream keeps the call's voice session, and the old stream's late events change nothing", async (t) => {
  const h = harness(t);
  const first = h.session.startLive();
  await h.untilOpened(1);
  const live = h.connected(0);
  await first;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'call' } }));
  // Mid-reply when Telnyx reopens the stream: the 1.5s still queued on the old one never plays.
  live.message({ type: 'session.output_audio.delta', delta: 'A'.repeat(16_000) });
  assert.ok(h.session.speechEndsAt > Date.now());
  const replacement = new Socket();
  h.session.attachPhone(replacement, 'ATL');
  await h.session.streamAttached(replacement);
  assert.equal(h.opens.length, 1, 'no second voice session');
  assert.equal(h.session.live, live);
  assert.equal(live.sent.filter((m) => m.type === 'session.start').length, 1);
  assert.equal(h.session.playbackEndsAt, Date.now());
  assert.equal(h.session.speechEndsAt, Date.now());
  replacement.message({ event: 'media', media: { payload: 'new-audio' } });
  assert.deepEqual(live.sent.at(-1), { type: 'session.input_audio.append', audio: 'new-audio' });
  live.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  assert.deepEqual(replacement.sent.at(-1), { event: 'media', media: { payload: 'AAAA' } });
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  const sentBefore = live.sent.length;
  assert.equal(h.phone.readyState, 3, 'the old stream is closed');
  h.phone.message({ event: 'media', media: { payload: 'stale' } });
  h.phone.message({ event: 'stop' });
  assert.equal(shutdown.mock.callCount(), 0);
  assert.equal(live.sent.length, sentBefore);
  assert.equal(h.values.has('orphanSince'), false);
});

test('a pending tool result is never delivered to a replacement model session', async (t) => {
  const h = harness(t);
  h.session.live = new Socket();
  const answer = deferred<string>();
  const asking = deferred<void>();
  t.mock.method(h.session, 'askUser', () => { asking.resolve(); return answer.promise; });
  const running = h.session.runTool({ call_id: 'old-function', name: 'ask_user', arguments: '{"question":"Which item?"}' });
  await asking.promise;
  const live = new Socket();
  h.session.live = live;
  answer.resolve('The lamb one');
  await running;
  assert.deepEqual(live.sent, []);
});

test('a live human remains protected from delayed greeting webhooks across a worker reset', async (t) => {
  const h = harness(t);
  h.session.live = new Socket();
  h.session.liveReady = true;
  const notify = (session: any, type: string, result: string, seconds: number) => session.fetch(new Request('https://session/machine', {
    method: 'POST', body: JSON.stringify({ event: machineEventOf(type, result), occurredAt: new Date(seconds * 1000).toISOString() }),
  }));
  await notify(h.session, 'call.machine.premium.detection.ended', 'human_business', 3);
  await h.session.onLive(JSON.stringify({ type: 'session.input_transcript.delta', delta: "Bosley's West Vancouver, Rachel speaking. How may I help you?" }));
  await notify(h.session, 'call.machine.premium.greeting.ended', 'no_beep_detected', 4);
  await notify(h.session, 'call.machine.premium.greeting.ended', 'prompt_ended', 5);
  assert.deepEqual(h.session.live.sent, []);
  const restarted = new VoiceSession(h.session.ctx, h.session.env) as any;
  restarted.setup = h.session.setup;
  restarted.live = new Socket();
  restarted.liveReady = true;
  await notify(restarted, 'call.machine.premium.detection.ended', 'machine', 1);
  await notify(restarted, 'call.machine.premium.greeting.ended', 'beep_detected', 6);
  assert.deepEqual(restarted.live.sent, []);
  assert.equal((h.values.get('machineDetection') as any).state.phase, 'human');
});

test('detector events before voice startup deliver only the final corrected guidance', async (t) => {
  const h = harness(t);
  const starting = h.session.startLive();
  await h.untilOpened(1);
  await h.session.machineDetected('machine', '2026-10-06T18:43:01Z');
  await h.session.machineDetected('human', '2026-10-06T18:43:02Z');
  const live = h.connected(0);
  await starting;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'ready' } }));
  const commentary = live.sent.filter((m) => m.type === 'session.commentary.append');
  assert.equal(commentary.length, 1);
  assert.match(commentary[0].content, /detected a live person/);
  await h.session.machineDetected('greeting_ended', '2026-10-06T18:43:03Z');
  assert.equal(live.sent.filter((m) => m.type === 'session.commentary.append').length, 1);
});

test('simultaneous duplicate beeps produce one conditional voicemail instruction', async (t) => {
  const h = harness(t);
  h.session.live = new Socket();
  h.session.liveReady = true;
  await Promise.all([
    h.session.machineDetected('greeting_ended', '2026-10-06T18:43:01Z'),
    h.session.machineDetected('greeting_ended', '2026-10-06T18:43:01Z'),
  ]);
  assert.equal(h.session.live.sent.length, 1);
  assert.match(h.session.live.sent[0].content, /If the audio confirms a voicemail greeting/);
  await h.session.machineDetected('human', '2026-10-06T18:43:00Z');
  assert.equal(h.session.live.sent.length, 2);
  assert.match(h.session.live.sent[1].content, /Disregard earlier/);
});

test('a stale HTTP failure body cannot end the phone that replaced it', async (t) => {
  const h = harness(t);
  const body = deferred<string>();
  const reading = deferred<void>();
  const starting = h.session.startLive();
  await h.untilOpened(1);
  h.opens[0].response.resolve({ status: 503, webSocket: null, text: () => { reading.resolve(); return body.promise; } } as any);
  await reading.promise;
  h.session.attachPhone(new Socket());
  body.resolve('old failure');
  await h.untilOpened(2);
  const live = h.connected(1);
  await starting;
  assert.equal(h.session.live, live);
  assert.equal(h.session.ended, false);
});

test('losing a phone cancels an unfinished provider connection', async (t) => {
  const h = harness(t);
  const opening = deferred<void>();
  let signal!: AbortSignal;
  t.mock.method(globalThis, 'fetch', (_input: unknown, init: RequestInit) => {
    signal = init.signal!;
    opening.resolve();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const starting = h.session.startLive();
  await opening.promise;
  await h.session.phoneLost(h.phone, 'test cancellation');
  await starting;
  assert.equal(signal.aborted, true);
  assert.equal(h.session.ended, false);
  assert.equal(h.session.live, null);
});

test('undelivered screening guidance survives reset and is delivered once when audio is ready', async (t) => {
  const h = harness(t);
  await h.session.machineDetected('screening_prompt_ended', '2026-10-06T18:43:01Z');
  const restarted = new VoiceSession(h.session.ctx, h.session.env) as any;
  restarted.setup = h.session.setup;
  restarted.live = new Socket();
  restarted.transcript.push({ role: 'them', text: "If you record your name and reason for calling, I'll see if this person is available.", at: Date.now() });
  await restarted.machineDetected('screening_prompt_ended', '2026-10-06T18:43:01Z');
  assert.deepEqual(restarted.live.sent, []);
  await restarted.onLive(JSON.stringify({ type: 'session.started', session: { id: 'after-reset' } }));
  assert.equal(restarted.live.sent.length, 1);
  assert.match(restarted.live.sent[0].content, /call screener is ready/);
  assert.equal((h.values.get('machineDetection') as any).pending, null);
  t.mock.timers.tick(5_000);
  assert.equal(restarted.live.sent.length, 1, 'startup hello must not interrupt a known screening prompt');
});

test('known machine pickup suppresses the startup hello while waiting for its greeting', async (t) => {
  const h = harness(t);
  await h.session.machineDetected('machine', '2026-10-06T18:43:01Z');
  h.session.live = new Socket();
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'machine' } }));
  t.mock.timers.tick(5_000);
  assert.equal(h.session.live.sent.length, 1);
  assert.match(h.session.live.sent[0].content, /Stay silent while the greeting plays/);
});

// 20ms G.711 μ-law frames, as Telnyx and GPT-Live both stream them nonstop: 0xFF is silence, 0x00 full scale.
const QUIET = btoa('\xff'.repeat(160));
const LOUD = btoa('\x00'.repeat(160));

/**
 * An outbound call just picked up, its voice session live. `play` runs the line frame by frame up to
 * `untilMs` after pickup, both ways, with `loud` saying which side is audible when; `hellos` is
 * whatever was sent that could make the caller speak up.
 */
async function outboundPickup(t: TestContext) {
  const h = harness(t);
  const live = (h.session.live = new Socket());
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'outbound' } }));
  const play = async (untilMs: number, loud: (ms: number) => { them?: boolean; caller?: boolean } = () => ({})) => {
    while (Date.now() - h.session.answeredAt < untilMs) {
      const { them, caller } = loud(Date.now() - h.session.answeredAt);
      h.session.phone.message({ event: 'media', media: { payload: them ? LOUD : QUIET } });
      await h.session.onLive(JSON.stringify({ type: 'session.output_audio.delta', delta: caller ? LOUD : QUIET }));
      t.mock.timers.tick(20);
    }
  };
  const hellos = (socket: Socket = live) => socket.sent.filter((m) => m.type === 'session.commentary.append' || m.type === 'session.instructions.append');
  const words = (role: 'them' | 'caller', delta: string) => h.session.onLive(JSON.stringify({ type: role === 'them' ? 'session.input_transcript.delta' : 'session.output_transcript.delta', delta }));
  return { h, live, play, hellos, words };
}

test("the silent-pickup hello never cuts into the caller's intro to someone listening quietly", async (t) => {
  // call_lcr5rgz3e4xsmesm, 2026-11-14: our caller started 61ms after pickup, to someone whose
  // "Hello?" came before it; nothing of theirs was transcribed until +10.9s. The hello went in at
  // +5s ("...testing their newHi, hello?") and the caller never spoke again.
  const { play, hellos, words } = await outboundPickup(t);
  const intro = (ms: number) => ({ caller: ms >= 61 && ms < 6_500 });
  await play(1_000, intro);
  await words('caller', "Hi! I'm Sarah, Alex's assistant. ");
  await play(4_000, intro);
  await words('caller', "Just letting you know Alex is testing their new phone assistant.");
  // They say "Hello?" again at +7.8s; its transcript lands 3s later.
  await play(10_900, (ms) => ({ ...intro(ms), them: ms >= 7_800 && ms < 8_300 }));
  await words('them', 'Hello?');
  await play(15_000);
  assert.deepEqual(hellos(), [], 'nothing cuts into the intro or tells the caller to wait');
});

test('a pickup silent both ways still gets the hello, once, as something to say now with no wait after it', async (t) => {
  const { play, hellos } = await outboundPickup(t);
  await play(4_980);
  assert.deepEqual(hellos(), []);
  await play(5_000);
  assert.equal(hellos().length, 1);
  assert.equal(hellos()[0].type, 'session.commentary.append');
  assert.match(hellos()[0].content, /Nobody has spoken since the call connected\. Say a short hello now.*When they answer, respond normally\./);
  assert.doesNotMatch(hellos()[0].content, /wait/i);
  await play(20_000);
  assert.equal(hellos().length, 1);
});

test('the hello waits while the other side is audibly talking, before any of it is transcribed', async (t) => {
  const { play, hellos, words } = await outboundPickup(t);
  // They talk from +3s to +8s; their words reach the transcript a second after they stop.
  await play(9_000, (ms) => ({ them: ms >= 3_000 && ms < 8_000 }));
  assert.deepEqual(hellos(), [], 'not while they are talking');
  await words('them', 'Front desk, this is Dana, sorry about that. How can I help?');
  await play(20_000);
  assert.deepEqual(hellos(), [], 'once their words are in, the caller answers them itself');
});

test('a sound from their side that is never transcribed only holds the hello until they have been quiet as long', async (t) => {
  const { play, hellos } = await outboundPickup(t);
  // The handset knocks on pickup, then nobody says anything.
  await play(5_400, (ms) => ({ them: ms >= 400 && ms < 500 }));
  assert.deepEqual(hellos(), []);
  await play(5_500);
  assert.equal(hellos().length, 1);
});

test("the caller's speech counts from its first audible frame, and still counts for a voice session opened after the phone stream was lost", async (t) => {
  const { h, play, hellos, words } = await outboundPickup(t);
  // Its audio starts just before the hello is due, ahead of any transcript of it.
  await play(5_200, (ms) => ({ caller: ms >= 4_800 }));
  assert.deepEqual(hellos(), []);
  await words('caller', 'Hi, this is Sarah calling for Alex.');
  await play(6_000, (ms) => ({ caller: ms < 5_800 }));
  // The stream drops and a new one comes up with a new voice session, which arms the hello again.
  await h.session.phoneLost(h.session.phone, 'test loss');
  h.session.attachPhone(new Socket());
  const replacement = (h.session.live = new Socket());
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'replacement' } }));
  await play(13_000);
  assert.equal(h.session.live, replacement);
  assert.deepEqual(hellos(replacement), [], 'our caller already spoke on this call');
});

test('a fresh durable object restores the ongoing call and relays audio using its saved transcript', async (t) => {
  const h = harness(t);
  const transcript = [{ role: 'them', text: 'Please give me two minutes to check the order.', at: 9000 }];
  await h.session.env.DB.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at, transcript)
    VALUES (?, 'acct_alice', '+14155550100', 'Test store', 'Reorder food', '{}', 'in_progress', 8000, 8500, ?)`)
    .bind(h.session.setup.callId, JSON.stringify(transcript)).run();
  h.values.set('setup', h.session.setup);
  h.values.set('liveStarted', true);
  h.values.set('wrapAt', 1_000_000);
  const restarted = new VoiceSession(h.session.ctx, h.session.env) as any;
  const phone = new Socket();
  restarted.attachPhone(phone);
  const attached = restarted.streamAttached(phone);
  await h.untilOpened(1);
  const live = h.connected(0);
  await attached;
  assert.equal(restarted.answeredAt, 8500);
  // The call's own instructions as they were, and the call so far as its history.
  assert.equal(live.sent[0].session.instructions, 'Test instructions');
  assert.deepEqual(live.sent[0].session.input[0], { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Please give me two minutes to check the order.' }] });
  assert.equal(h.values.get('wrapAt'), 1_000_000);
  await restarted.onLive(JSON.stringify({ type: 'session.started', session: { id: 'restored' } }));
  phone.message({ event: 'media', media: { payload: 'new-phone-audio' } });
  live.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  assert.deepEqual(live.sent.at(-1), { type: 'session.input_audio.append', audio: 'new-phone-audio' });
  assert.deepEqual(phone.sent.at(-1), { event: 'media', media: { payload: 'AAAA' } });
});

test("once the user joins, the caller goes quiet: none of its speech reaches the line or the transcript, and it uses no tools until they hand back", async (t) => {
  // The caller can't hear the user, and told everyone could hear everyone it answered for them: at
  // Spectrum it read out made-up verification codes and "Yes, I authorize you" before Anna spoke
  // (call_9hr5465c2jrqm2le, Nov 23).
  const h = harness(t);
  const live = new Socket();
  h.session.live = live;
  h.session.liveReady = true;
  h.session.setup.person = { name: 'Alex Kim' };
  h.session.personLeg = 'person-leg';
  await h.session.personJoined();
  assert.match(JSON.stringify(live.sent.at(-1)), /Alex Kim has joined the call.*You can't hear Alex Kim.*Stay completely silent and don't use any tools/);
  assert.ok(h.phone.sent.some((m: any) => m.event === 'clear'), 'what the caller had queued is cut off');
  const sentToPhone = h.phone.sent.length;
  await h.session.onLive(JSON.stringify({ type: 'session.output_audio.delta', delta: 'AAAA' }));
  await h.session.onLive(JSON.stringify({ type: 'session.output_transcript.delta', delta: 'Yes, I authorize you' }));
  assert.equal(h.phone.sent.length, sentToPhone, 'nothing the caller says reaches the line');
  assert.ok(!h.session.transcript.some((l: any) => l.role === 'caller'), 'nor the transcript');

  const hangups: string[] = [];
  h.session.hangup = async (why: string) => { hangups.push(why); };
  await h.session.runTool({ call_id: 'bye', name: 'end_call', arguments: '{}' });
  assert.deepEqual(hangups, []);
  assert.match(JSON.stringify(live.sent.at(-1)), /Alex Kim is on the call, so do nothing until they hand it back/);

  h.session.personLeft();
  assert.match(JSON.stringify(live.sent.at(-1)), /Alex Kim has left the call and handed it back to you.*I'm back on for Alex Kim/);
  await h.session.onLive(JSON.stringify({ type: 'session.output_audio.delta', delta: 'BBBB' }));
  assert.deepEqual(h.phone.sent.at(-1), { event: 'media', media: { payload: 'BBBB' } }, 'handed back, the caller is heard again');
});

test('at the time limit the user on the call gets more time while credits last, then it ends', async (t) => {
  const { accounts } = await import('../src/server/services/accounts');
  const h = harness(t);
  const db = h.session.env.DB;
  const hangups: string[] = [];
  h.session.hangup = async (why: string) => { hangups.push(why); };
  h.session.heardThem = true;
  h.session.personOn = true;
  h.session.setup.pricePerMinuteCents = 25;
  await accounts(db).post('acct_alice', 50, 'adjustment', 'seed', 'credits');
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at) VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Test store', 'Reorder food', '{}', 'in_progress', 0, ?)`).bind(Date.now()).run();
  // Nobody has said anything for a while, but the user is on: two more minutes, held from the balance.
  h.values.set('stopAt', Date.now() - 1);
  await h.session.alarm();
  assert.deepEqual(hangups, []);
  assert.equal(h.values.get('stopAt'), Date.now() + 2 * 60_000);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 0);

  t.mock.timers.tick(2 * 60_000);
  await h.session.alarm();
  assert.deepEqual(hangups, ['the call reached its time limit']);
});

test('time notices go in as quiet context, never as an instruction that can cut off a reply', async (t) => {
  const { accounts } = await import('../src/server/services/accounts');
  const h = harness(t);
  const db = h.session.env.DB;
  const live = (h.session.live = new Socket());
  h.session.hangup = async () => {};
  h.session.heardThem = true;
  h.session.setup.pricePerMinuteCents = 25;
  await accounts(db).post('acct_alice', 50, 'adjustment', 'seed', 'credits');
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at) VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Test store', 'Book a photo shoot', '{}', 'in_progress', 0, ?)`).bind(Date.now()).run();
  // The clock fires wherever the conversation is, here just as the business finished a sentence.
  h.values.set('wrapAt', Date.now() - 1);
  await h.session.alarm();
  assert.equal(h.values.get('stopAt'), Date.now() + 40_000);
  assert.equal(live.sent.at(-1).type, 'session.thinking.append');
  assert.match(live.sent.at(-1).content, /Time is almost up: about 40 seconds left\. Answer what they just said, then wrap up/);

  t.mock.timers.tick(40_000);
  h.session.lastSpokeAt = { them: Date.now() - 1_000, caller: Date.now() - 2_000 };
  await h.session.alarm();
  assert.equal(h.values.get('stopAt'), Date.now() + 2 * 60_000, 'still talking: more time instead of a hang-up');
  assert.equal(live.sent.at(-1).type, 'session.thinking.append');
  assert.match(live.sent.at(-1).content, /still talking with you, so you have 2 more minutes/);
  assert.ok(!live.sent.some((m: any) => m.type === 'session.instructions.append'), 'no time notice can interrupt the caller');
});

/**
 * call_bje9ny6dv8smyujy's start: an outbound call whose recording says "we will be with you
 * shortly" 1.8s after pickup, which puts it on hold, with `credits` cents for extensions at 25c a
 * minute and its wrap-up point `limitMs` after pickup. `marks` is what the session logged,
 * `warning` the low-credit email it queued on the call's row, and `replay` plays the line like
 * `play` while firing the session's alarm whenever it comes due, as Cloudflare does.
 */
async function onHold(t: TestContext, limitMs: number, credits = 10_000) {
  const { accounts } = await import('../src/server/services/accounts');
  const log = t.mock.method(console, 'log', () => {});
  const pickup = await outboundPickup(t);
  const { h, play, words } = pickup;
  const db = h.env.DB;
  h.session.setup.pricePerMinuteCents = 25;
  await accounts(db).post('acct_alice', credits, 'adjustment', 'seed', 'credits');
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at) VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Test apartments', 'Ask about a unit', '{}', 'in_progress', 0, ?)`).bind(h.session.answeredAt).run();
  // The limit is set and the alarm armed at pickup, before anything puts the call on hold.
  const wrapAt = h.session.answeredAt + limitMs;
  h.values.set('wrapAt', wrapAt);
  await h.session.scheduleAlarm();
  await play(1_800, () => ({ them: true }));
  await words('them', 'Thank you for calling. We will be with you shortly.');
  assert.equal(h.session.hold.holding(), true);
  // The credit check the hold's start set off settles before the test goes on.
  await new Promise((resolve) => setImmediate(resolve));
  const balance = () => accounts(db).balanceCents('acct_alice');
  const marks = () => log.mock.calls.map((c: any) => String(c.arguments[0]));
  const warning = () => db.prepare(`SELECT low_credit_at, low_credit_deadline_at, low_credit_minutes FROM calls WHERE id = 'recovery_test'`).first();
  const replay = async (untilMs: number, loud?: Parameters<typeof play>[1]) => {
    while (Date.now() - h.session.answeredAt < untilMs) {
      const due = h.values.get('alarm') as number;
      assert.equal(typeof due, 'number', 'the alarm stays armed');
      await play(Math.min(due - h.session.answeredAt, untilMs), loud);
      if (Date.now() >= due) await h.session.alarm();
    }
  };
  return { ...pickup, wrapAt, balance, marks, warning, replay };
}

test('a hold on a line gone dead gets one extension, then none once it has been silent through it, and the call wraps up', async (t) => {
  // call_bje9ny6dv8smyujy: ringback until +87s after our 1, then exact-zero audio from a transfer
  // that never hung up, extended 15 minutes at a time for 2h13m.
  const { h, live, play, wrapAt, balance, marks } = await onHold(t, 3 * 60_000);
  const hangups: string[] = [];
  h.session.hangup = async (why: string) => { hangups.push(why); };
  await play(3 * 60_000, (ms) => ({ them: ms < 87_000 }));
  await h.session.alarm();
  assert.equal(h.values.get('wrapAt'), wrapAt + 15 * 60_000, '93s of quiet could still be someone gone to look');
  assert.equal(await balance(), 10_000 - 15 * 25);

  await play(18 * 60_000);
  await h.session.alarm();
  assert.equal(h.values.get('wrapAt'), wrapAt + 15 * 60_000, 'no more time');
  assert.equal(h.values.get('stopAt'), Date.now() + 40_000);
  assert.ok(live.sent.some((m: any) => m.type === 'session.thinking.append' && /Time is almost up/.test(m.content)), 'the wrap-up note goes in');
  assert.ok(marks().some((m) => /line silent 993s on hold at the time limit: not extending/.test(m)));
  assert.equal(await balance(), 10_000 - 15 * 25, 'no credits held for a second extension');

  await play(18 * 60_000 + 40_000);
  await h.session.alarm();
  assert.deepEqual(hangups, ['the call reached its time limit']);
});

test('a hold on queue music still gets its extension when the limit lands at the end of an 11.4s gap in the loop', async (t) => {
  // Amazon's hold loop goes quiet up to 11.4s between plays; here every 31.4s, the limit at the end of the sixth gap.
  const cycle = 31_400;
  const { h, play, wrapAt, balance, marks } = await onHold(t, 6 * cycle);
  await play(6 * cycle, (ms) => ({ them: ms % cycle < cycle - 11_400 }));
  await h.session.alarm();
  assert.equal(h.values.get('wrapAt'), wrapAt + 15 * 60_000);
  assert.equal(h.values.has('stopAt'), false);
  assert.ok(marks().some((m) => /still on hold at the time limit: held 15 more min/.test(m)));
  assert.equal(await balance(), 10_000 - 15 * 25);
});

test('a silent hold where someone went to look still gets its extension at the time limit', async (t) => {
  // call_x25yrdf0y2pfa497: "let me go look, hold on one second" at +46s, then the line's noise floor
  // until the limit at +195s. A one-minute rule ended the call before they came back.
  const { h, play, wrapAt, marks } = await onHold(t, 195_000);
  await play(195_000, (ms) => ({ them: ms < 52_000 }));
  await h.session.alarm();
  assert.equal(h.values.get('wrapAt'), wrapAt + 15 * 60_000);
  assert.equal(h.values.has('stopAt'), false);
  assert.ok(!marks().some((m) => /not extending/.test(m)));
});

test('a hold silent for just under 10 minutes at the limit still gets its extension', async (t) => {
  const { h, play, wrapAt, marks } = await onHold(t, 12 * 60_000);
  await play(12 * 60_000, (ms) => ({ them: ms < 2 * 60_000 + 1_000 }));
  await h.session.alarm();
  assert.equal(h.values.get('wrapAt'), wrapAt + 15 * 60_000);
  assert.ok(!marks().some((m) => /not extending/.test(m)));
});

test("a session reset mid-hold doesn't make the queue look silent, and a dead line is still caught after it", async (t) => {
  const { accounts } = await import('../src/server/services/accounts');
  const h = harness(t);
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const db = h.env.DB;
  h.session.setup.pricePerMinuteCents = 25;
  await accounts(db).post('acct_alice', 10_000, 'adjustment', 'seed', 'credits');
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at, hold_since) VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Test apartments', 'Ask about a unit', '{}', 'in_progress', 0, ?, ?)`)
    .bind(h.session.answeredAt, h.session.answeredAt + 1_800).run();
  h.values.set('setup', h.session.setup);
  h.values.set('liveStarted', true);
  // 20 minutes into the hold, the instance holding the call is reset and its stream drops.
  h.phone.close();
  t.mock.timers.tick(20 * 60_000);
  const restarted = new VoiceSession(h.session.ctx, h.session.env) as any;
  const phone = new Socket();
  restarted.attachPhone(phone);
  const attached = restarted.streamAttached(phone);
  await h.untilOpened(1);
  h.connected(0);
  await attached;
  await restarted.onLive(JSON.stringify({ type: 'session.started', session: { id: 'restored' } }));
  assert.equal(restarted.hold.holding(), true, 'the hold resumes');
  const frames = (ms: number) => {
    for (let at = 0; at < ms; at += 20) {
      phone.message({ event: 'media', media: { payload: QUIET } });
      t.mock.timers.tick(20);
    }
  };
  // The stream comes back in a gap of the queue's music, 5s before the wrap-up point.
  frames(5_000);
  h.values.set('wrapAt', Date.now());
  await restarted.alarm();
  assert.equal(h.values.get('wrapAt'), Date.now() + 15 * 60_000, 'quiet before this instance heard the line is not silence');

  // The queue is dead after all: ten minutes of nothing on this instance's own frames.
  frames(10 * 60_000);
  h.values.set('wrapAt', Date.now());
  await restarted.alarm();
  assert.equal(h.values.get('stopAt'), Date.now() + 40_000);
});

const lowCreditMarks = (marks: string[]) => marks.filter((m) => /low credits on hold: warning queued/.test(m));
const music = () => ({ them: true });
const MIN = 60_000;

test('a hold short of credits for its time limit queues a low-credit email from the alarm 15 minutes before the limit', async (t) => {
  // $1 at 25c a minute: 4 of the 15 minutes the limit 16 minutes after pickup would extend by.
  const { h, replay, warning, marks } = await onHold(t, 16 * MIN, 100);
  assert.equal((await warning())!.low_credit_at, null, 'the limit is more than 15 minutes off when the hold starts');
  await replay(1 * MIN - 20, music);
  assert.equal((await warning())!.low_credit_at, null);
  assert.equal(h.values.get('alarm'), h.session.answeredAt + 1 * MIN, 'the alarm lands on the check');
  await replay(1 * MIN + 20, music);
  // The 4 minutes run out at +20: 19 minutes after the check.
  assert.deepEqual({ ...(await warning()) }, { low_credit_at: h.session.answeredAt + 1 * MIN, low_credit_deadline_at: h.session.answeredAt + 20 * MIN, low_credit_minutes: 19 });
  assert.deepEqual(lowCreditMarks(marks()).map((m) => m.replace(/ \(.*/, '')), ['call recovery_test: low credits on hold: warning queued, credits cover about 19 more min']);
});

test('a full extension that leaves too few credits for the one after it queues the warning as soon as it is granted', async (t) => {
  // $4.75: the first limit's 15 minutes, then $1 plus what the half-price hold leaves unused.
  const { h, replay, warning, marks, wrapAt } = await onHold(t, 3 * MIN, 475);
  await replay(3 * MIN - 20, music);
  assert.equal((await warning())!.low_credit_at, null, 'the first extension is covered in full');
  await replay(3 * MIN + 20, music);
  assert.equal(h.values.get('wrapAt'), wrapAt + 15 * MIN);
  // At +18 the credits fund 9 minutes, then 5, 2, 1 and 1 as each half-price stretch leaves some unused.
  assert.deepEqual({ ...(await warning()) }, { low_credit_at: wrapAt, low_credit_deadline_at: h.session.answeredAt + 36 * MIN, low_credit_minutes: 33 });
  assert.equal(lowCreditMarks(marks()).length, 1);
  // Nobody adds any: the session wraps up right where the email said.
  await replay(36 * MIN + 20, music);
  assert.deepEqual(marks().filter((m) => /held \d+ more min/.test(m)).map((m) => m.match(/held (\d+)/)![1]), ['15', '9', '5', '2', '1', '1']);
  assert.equal(h.values.get('wrapAt'), h.session.answeredAt + 36 * MIN);
  assert.equal(h.values.get('stopAt'), h.session.answeredAt + 36 * MIN + 40_000);
});

test('no low-credit warning while the credits cover the next extension', async (t) => {
  const { h, replay, warning, marks, wrapAt } = await onHold(t, 3 * MIN);
  await replay(3 * MIN + 20, music);
  assert.equal(h.values.get('wrapAt'), wrapAt + 15 * MIN);
  assert.equal((await warning())!.low_credit_at, null);
  assert.deepEqual(lowCreditMarks(marks()), []);
});

test('no low-credit warning on a hold whose line has gone silent, until it carries sound again', async (t) => {
  // The same short credits as above, the line dead from the recording on: silent 10 minutes by the
  // check 15 minutes before its limit, it gets no extension there, so nothing to warn about.
  const { h, replay, warning, marks } = await onHold(t, 26 * MIN, 100);
  await replay(12 * MIN);
  assert.equal((await warning())!.low_credit_at, null);
  assert.deepEqual(lowCreditMarks(marks()), []);
  // Queue music comes back: the next alarm warns.
  await replay(12 * MIN + 20_000, music);
  assert.equal((await warning())!.low_credit_at, h.session.answeredAt + 12 * MIN + 20_000);
});

test('a hold starting with its limit already close queues the warning at once, and only once per call', async (t) => {
  const { h, replay, warning, marks, wrapAt } = await onHold(t, 3 * MIN, 100);
  // The hold starts at +1.8s with the limit 3 minutes after pickup: 4 more minutes, to +7, 6 whole minutes off.
  const queued = { low_credit_at: h.session.answeredAt + 1_800, low_credit_deadline_at: h.session.answeredAt + 7 * MIN, low_credit_minutes: 6 };
  assert.deepEqual({ ...(await warning()) }, queued);
  // The heartbeats, the partial extension at the limit, and checks after it add none.
  await replay(3 * MIN + 20, music);
  assert.equal(h.values.get('wrapAt'), wrapAt + 4 * MIN);
  assert.ok(marks().some((m) => /still on hold at the time limit: held 4 more min/.test(m)));
  // Nor does the row let a second one in when the session's own note of it is gone.
  h.values.delete('lowCreditsWarned');
  await replay(4 * MIN, music);
  assert.deepEqual({ ...(await warning()) }, queued);
  assert.equal(lowCreditMarks(marks()).length, 1);
});

test('credits added after the low-credit warning pay for the next extension in full', async (t) => {
  const { accounts } = await import('../src/server/services/accounts');
  const { h, replay, warning, marks, wrapAt, balance } = await onHold(t, 3 * MIN, 100);
  assert.notEqual((await warning())!.low_credit_at, null);
  await accounts(h.env.DB).post('acct_alice', 1_000, 'topup', 'topup:test', 'added after the email');
  await replay(3 * MIN + 20, music);
  assert.equal(h.values.get('wrapAt'), wrapAt + 15 * MIN);
  assert.equal(h.values.has('stopAt'), false);
  assert.ok(marks().some((m) => /still on hold at the time limit: held 15 more min/.test(m)));
  assert.equal(await balance(), 1_100 - 15 * 25);
});

test("a screener whose question isn't recognized still gets an introduction once it goes quiet", async (t) => {
  const h = harness(t);
  h.session.live = new Socket();
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'screened' } }));
  const before = h.session.live.sent.length;
  h.session.transcript.push({ role: 'them', text: 'Hi, this is an assistant answering for the person you called. Go ahead.', at: Date.now() });
  h.session.lastTranscriptAt = Date.now();
  await h.session.machineDetected('screening_prompt_ended', '2026-10-06T18:43:01Z');
  assert.equal(h.session.live.sent.length, before, 'waits while the screener may still be talking');
  t.mock.timers.tick(6_200);
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.ok(h.session.live.sent.slice(before).some((m: any) => /call screener is ready/.test(m.content ?? '')), 'introduces after the quiet');
});

test('a screener none of whose words were transcribed still gets an introduction', async (t) => {
  // AccuVision Optometry: the carrier said a screening prompt ended, nothing of it was transcribed,
  // and our caller waited 75s for the screener's first words.
  const h = harness(t);
  h.session.live = new Socket();
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'unheard' } }));
  const live = h.session.live;
  const before = live.sent.length;
  await h.session.machineDetected('screening_prompt_ended', '2026-11-13T23:22:48Z');
  const introduced = () => live.sent.slice(before).some((m: any) => /call screener is ready/.test(m.content ?? ''));
  // The line carries audio the whole time (the untranscribed prompt), a second at a time.
  const wait = async (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      h.phone.message({ event: 'media', media: { payload: 'prompt-audio' } });
      t.mock.timers.tick(1_000);
      await new Promise((r) => setImmediate(r));
      for (let j = 0; j < 20; j++) await Promise.resolve();
    }
  };
  await wait(7);
  assert.equal(introduced(), false, 'a prompt may still be playing untranscribed');
  await wait(9);
  assert.ok(introduced(), 'introduces once it has had time to finish');
});

test("a voice session that expires while the phone rings doesn't hang up the call; pickup opens a fresh one", async (t) => {
  const h = harness(t);
  h.session.answered = false;
  const early = h.session.startLive();
  await h.untilOpened(1);
  const ringing = h.connected(0);
  await early;
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  // GPT-Live says why before its socket closes: ~30s into ringing with no audio, "expired". Tassos's
  // Eurobank calls were hung up right there, twice, still ringing.
  ringing.message({ type: 'session.closed', reason: 'expired' });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  ringing.close();
  assert.equal(shutdown.mock.callCount(), 0);
  assert.equal(h.session.live, null);
  assert.equal(h.session.ended, false);

  h.session.answered = true;
  const pickup = h.session.startLive();
  await h.untilOpened(2);
  const live = h.connected(1);
  await pickup;
  assert.equal(h.session.live, live);
  assert.equal(live.sent[0].type, 'session.start');
  // Once someone has answered, the session closing ends the call as before.
  live.message({ type: 'session.closed', reason: 'expired' });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(shutdown.mock.callCount(), 1);
});

test('a voice session from before pickup that expires just after it, before anyone spoke, is replaced instead of hanging up', async (t) => {
  // Restaurante Taracea, 2026-11-14: answered 29.2s after its session started, which expired a
  // second later, and the call hung up on them.
  const h = harness(t);
  h.session.answered = false;
  const early = h.session.startLive();
  await h.untilOpened(1);
  const ringing = h.connected(0);
  await early;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'ringing' } }));
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  t.mock.timers.tick(29_200);
  h.session.answered = true;
  h.session.answeredAt = Date.now();
  t.mock.timers.tick(1_000);
  ringing.message({ type: 'session.closed', reason: 'expired' });
  await h.untilOpened(2);
  const fresh = h.connected(1);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(shutdown.mock.callCount(), 0, 'the call stays up');
  assert.equal(h.session.live, fresh);
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'fresh' } }));
  // The replacement started after pickup: its own close ends the call, so nothing loops.
  fresh.message({ type: 'session.closed', reason: 'expired' });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(shutdown.mock.callCount(), 1);
});

test('a voice session from before pickup that expires after someone spoke ends the call as before', async (t) => {
  const h = harness(t);
  h.session.answered = false;
  const early = h.session.startLive();
  await h.untilOpened(1);
  const ringing = h.connected(0);
  await early;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'ringing' } }));
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  t.mock.timers.tick(29_200);
  h.session.answered = true;
  h.session.answeredAt = Date.now();
  h.session.appendTranscript('them', 'Restaurante Taracea, dígame.');
  ringing.message({ type: 'session.closed', reason: 'expired' });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(shutdown.mock.callCount(), 1);
  assert.equal(h.opens.length, 1);
});

const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/**
 * An outbound call whose voice session GPT-Live started at pickup, expiring two hours later as
 * every session does. `said` puts words on the line from `socket`'s session, `line` runs the
 * phone a second at a time (`loud` for hold music) and `marks` is what the session logged.
 */
async function liveCall(t: TestContext) {
  const log = t.mock.method(console, 'log', () => {});
  const h = harness(t);
  h.session.setup.maxSeconds = 4 * 60 * 60;
  const starting = h.session.startLive();
  await h.untilOpened(1);
  const live = h.connected(0);
  await starting;
  live.message({ type: 'session.started', session: { id: 'live_first', expires_at: (Date.now() + 120 * MIN) / 1000 } });
  await settle();
  const said = async (socket: Socket, role: 'them' | 'caller', delta: string) => {
    socket.message({ type: role === 'them' ? 'session.input_transcript.delta' : 'session.output_transcript.delta', delta });
    await settle();
  };
  const line = (ms: number, loud = false) => {
    for (let at = 0; at < ms; at += 1_000) {
      h.phone.message({ event: 'media', media: { payload: loud ? LOUD : QUIET } });
      t.mock.timers.tick(1_000);
    }
  };
  const marks = () => log.mock.calls.map((c: any) => String(c.arguments[0]));
  const nudges = (socket: Socket) => socket.sent.filter((m) => m.type === 'session.commentary.append' || m.type === 'session.instructions.append');
  return { h, live, said, line, marks, nudges };
}

const historyOf = (start: any) => start.session.input.map((m: any) => `${m.role}: ${m.content[0].text}`);

test("a call on hold when its voice session nears GPT-Live's two hours moves to a new session that knows the call, with nothing heard twice and no hello", async (t) => {
  // call_f7ihvt0ubr23hf6e, 2026-11-15: American Airlines held the customer two hours on one
  // session, which expired 7199.4s after it started and hung up on them.
  const { h, live, said, line, marks, nudges } = await liveCall(t);
  await said(live, 'them', 'Thank you for calling American Airlines. What is your confirmation code?');
  await said(live, 'caller', "Hi, I'm calling for Alex Kim. The code is K X 7 4 Q 2.");
  await said(live, 'them', 'Thank you. Please hold while I transfer you to a specialist.');
  assert.equal(h.session.hold.holding(), true);
  line(99 * MIN, true);
  await h.session.alarm();
  assert.equal(h.opens.length, 1, 'more than 20 minutes left: nothing yet');
  line(6 * MIN, true);
  // The queue's recording just played: it may go on, so not yet, and no waiting for the next heartbeat either.
  await said(live, 'them', 'Your call is important to us. Please stay on the line.');
  line(3_000, true);
  await h.session.alarm();
  assert.equal(h.opens.length, 1, 'not 3s after a recording');
  line(4_000, true);
  assert.equal(h.opens.length, 1);
  line(1_000, true);
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  const start = next.sent[0];
  assert.equal(start.type, 'session.start');
  assert.equal(start.session.instructions, 'Test instructions', "the call's own instructions, unchanged");
  assert.deepEqual(historyOf(start).slice(0, 3), [
    'user: Thank you for calling American Airlines. What is your confirmation code?',
    "assistant: Hi, I'm calling for Alex Kim. The code is K X 7 4 Q 2.",
    'user: Thank you. Please hold while I transfer you to a specialist.Your call is important to us. Please stay on the line.',
  ]);
  assert.equal(start.session.input[1].content[0].type, 'output_text');
  const note = historyOf(start).at(-1);
  assert.match(note, /^developer: You are back on the SAME call.*Do not greet them or introduce yourself again/);
  assert.match(note, /They put you on hold 105 minutes ago, and you are still waiting\. Stay completely silent through hold music and recordings/);
  assert.match(note, /Keys pressed on this call so far:\n\(no keypad input has been submitted\)/);
  assert.equal(h.session.live, live, 'the old session serves the call while the new one starts');

  // The queue's music while it starts reaches the old one serving the call, and the new one as it
  // takes over: its last 4s, GPT-Live refusing a burst over 5s.
  const before = live.sent.length;
  for (let i = 0; i < 300; i++) {
    h.phone.message({ event: 'media', media: { payload: LOUD } });
    t.mock.timers.tick(20);
  }
  assert.equal(live.sent.length, before + 300);
  assert.equal(next.sent.length, 1, 'nothing reaches it before it has started');
  next.message({ type: 'session.started', session: { id: 'live_second', expires_at: (Date.now() + 120 * MIN) / 1000 } });
  await settle();
  assert.equal(h.session.live, next);
  assert.deepEqual(next.sent.slice(1), Array(200).fill({ type: 'session.input_audio.append', audio: LOUD }));
  assert.ok(marks().some((m) => /voice session rolled over \(planned\) at 631\ds session age/.test(m)), marks().filter((m) => /roll/.test(m)).join('\n'));
  assert.ok(marks().some((m) => /replacement voice session live_second started/.test(m)));

  // The old session is closed the way GPT-Live asks, and nothing it says reaches the phone.
  assert.deepEqual(live.sent.at(-1), { type: 'session.close' });
  assert.equal(live.readyState, 1, 'kept until it confirms');
  const phoneBefore = h.phone.sent.length;
  live.message({ type: 'session.output_audio.delta', delta: LOUD });
  assert.equal(h.phone.sent.length, phoneBefore);
  live.message({ type: 'session.closed', reason: 'close_requested' });
  await settle();
  assert.equal(live.readyState, 3);
  assert.equal(h.session.ended, false);
  next.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  assert.deepEqual(h.phone.sent.at(-1), { event: 'media', media: { payload: 'AAAA' } });
  line(10_000, true);
  assert.equal(next.sent.filter((m) => m.type === 'session.input_audio.append').length, 210, 'the line goes to the new session only');
  assert.deepEqual(nudges(next), [], 'no hello, no greeting');
  assert.equal(h.session.hold.holding(), true);
});

test('a replacement the call moved on from while it started is dropped, and a later heartbeat rolls over', async (t) => {
  const { h, live, said, line, marks } = await liveCall(t);
  await said(live, 'them', 'Please hold for the next available agent.');
  line(105 * MIN, true);
  await h.session.alarm();
  await h.untilOpened(2);
  const early = h.connected(1);
  await settle();
  // An agent picks up while it starts: the history it was given is already out of date.
  await said(live, 'them', 'Hi, this is Maria, how can I help you today?');
  assert.equal(h.session.hold.holding(), false);
  early.message({ type: 'session.started', session: { id: 'live_early' } });
  await settle();
  assert.equal(h.session.live, live);
  assert.deepEqual(early.sent.at(-1), { type: 'session.close' });
  assert.ok(marks().some((m) => /replacement voice session dropped: the call moved on while it started/.test(m)));
  early.message({ type: 'session.output_audio.delta', delta: LOUD });
  assert.ok(!h.phone.sent.some((m: any) => m.media?.payload === LOUD), 'nothing it says reaches the phone');

  // Later the line has been quiet a while, with no hold now: in the last 8 minutes, a quiet moment will do.
  await said(live, 'caller', "Hi Maria, I'm calling for Alex Kim about the refund on order 4417.");
  await said(live, 'them', 'Okay, I see the order here. The refund went out yesterday.');
  line(8 * MIN);
  await h.session.alarm();
  await h.untilOpened(3);
  const next = h.connected(2);
  await settle();
  assert.equal(historyOf(next.sent[0]).at(-2), 'user: Okay, I see the order here. The refund went out yesterday.');
  assert.doesNotMatch(historyOf(next.sent[0]).at(-1), /on hold/);
  next.message({ type: 'session.started', session: { id: 'live_next' } });
  await settle();
  assert.equal(h.session.live, next);
  assert.ok(marks().some((m) => /voice session rolled over \(planned\) at \d+s session age/.test(m)));
});

test('a rollover in the last minutes waits for a quiet moment and for an ask_user out to the person, whose late answer reaches the new session', async (t) => {
  const { h, live, said, line } = await liveCall(t);
  await h.env.DB.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at) VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Example Clinic', 'Book a cleaning', '{}', 'in_progress', 0)`).run();
  h.session.setup.person = { name: 'Alex Kim' };
  await said(live, 'them', 'Front desk, this is Dana.');
  await said(live, 'caller', "Hi Dana, I'm calling for Alex Kim to book a cleaning.");
  line(118 * MIN);
  // Talking: no rollover mid-sentence.
  await said(live, 'them', 'Sure, what day works for Alex?');
  line(1_000);
  await h.session.alarm();
  assert.equal(h.opens.length, 1);
  // The back office asks Alex; the line is quiet, but its function belongs to this session's socket.
  live.message({ type: 'response.event', delegation_id: 'd1', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'ask-1', name: 'ask_user', arguments: '{"question":"Which day works for the cleaning?"}' } } });
  await settle();
  assert.equal(h.session.waiting.size, 1);
  line(5_000);
  await h.session.alarm();
  assert.equal(h.opens.length, 1, 'not while ask_user waits');

  // GPT-Live expires the session with the question still out, and the answer comes after.
  line(90_000);
  live.message({ type: 'session.closed', reason: 'expired' });
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  assert.match(historyOf(next.sent[0]).at(-1), /A question is out to Alex Kim: "Which day works for the cleaning\?"\. Their answer is passed to you the moment it comes in\./);
  next.message({ type: 'session.started', session: { id: 'live_second' } });
  await settle();
  const [{ id }] = await h.session.env.DB.prepare(`SELECT id FROM call_questions`).all().then((r: any) => r.results);
  await h.session.fetch(new Request('https://session/answer', { method: 'POST', body: JSON.stringify({ id, question: 'Which day works for the cleaning?', answer: 'Tuesday morning' }) }));
  await settle();
  assert.ok(next.sent.some((m) => m.type === 'session.commentary.append' && /Tuesday morning/.test(m.content)), 'the answer reaches the session now on the call');
  assert.ok(!next.sent.some((m) => m.type === 'response.item.create'), "the old session's function result stays with it");
  assert.equal(h.session.ended, false);
});

test('a voice session that expires mid-call is replaced by one that knows the call, instead of hanging up', async (t) => {
  const { h, live, said, line, marks, nudges } = await liveCall(t);
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  await said(live, 'them', 'Leasing office, this is Sam.');
  await said(live, 'caller', 'Hi Sam, do you have any studios open?');
  await said(live, 'them', 'Let me check what is coming up.');
  line(2 * MIN);
  live.message({ type: 'session.closed', reason: 'expired' });
  await settle();
  line(1_000);
  live.close();
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  assert.equal(shutdown.mock.callCount(), 0);
  assert.equal(h.session.live, next);
  assert.deepEqual(historyOf(next.sent[0]).slice(0, 3), ['user: Leasing office, this is Sam.', 'assistant: Hi Sam, do you have any studios open?', 'user: Let me check what is coming up.']);
  assert.ok(marks().some((m) => /voice session rolled over \(after expired\) at 120s session age/.test(m)));
  // The second of the line while it opened is held for it, as at pickup.
  next.message({ type: 'session.started', session: { id: 'live_second' } });
  await settle();
  assert.deepEqual(next.sent.filter((m) => m.type === 'session.input_audio.append'), [{ type: 'session.input_audio.append', audio: QUIET }]);
  next.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  assert.deepEqual(h.phone.sent.at(-1), { event: 'media', media: { payload: 'AAAA' } });
  line(10_000);
  assert.deepEqual(nudges(next), []);
});

test("a session GPT-Live's safety filter ends still ends the call", async (t) => {
  const { h, live, said, line } = await liveCall(t);
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  await said(live, 'them', 'Hello?');
  line(2 * MIN);
  live.message({ type: 'session.closed', reason: 'content' });
  await settle();
  assert.equal(shutdown.mock.callCount(), 1);
  assert.equal(h.opens.length, 1);
});

test('a call gets at most four replacement voice sessions', async (t) => {
  const { h, live, said, line } = await liveCall(t);
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  await said(live, 'them', 'Please hold.');
  // Each of four sessions drops a couple of minutes in, a socket closing with no word from GPT-Live among them.
  let current = live;
  for (let n = 1; n <= 4; n++) {
    line(2 * MIN, true);
    if (n === 1) current.close();
    else current.message({ type: 'session.closed', reason: 'connection_lost' });
    await h.untilOpened(n + 1);
    current = h.connected(n);
    await settle();
    current.message({ type: 'session.started', session: { id: `live_${n}` } });
    await settle();
  }
  assert.equal(shutdown.mock.callCount(), 0);
  line(2 * MIN, true);
  current.message({ type: 'session.closed', reason: 'expired' });
  await settle();
  assert.equal(shutdown.mock.callCount(), 1, 'the fifth ends the call');
  assert.equal(h.opens.length, 5);
});

test('a replacement voice session that ends within a minute of starting ends the call', async (t) => {
  const { h, live, said, line } = await liveCall(t);
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  await said(live, 'them', 'Hello?');
  line(2 * MIN);
  live.message({ type: 'session.closed', reason: 'expired' });
  await h.untilOpened(2);
  const replacement = h.connected(1);
  await settle();
  replacement.message({ type: 'session.started', session: { id: 'live_short' } });
  await settle();
  line(30_000);
  replacement.message({ type: 'session.closed', reason: 'expired' });
  await settle();
  assert.equal(shutdown.mock.callCount(), 1);
  assert.equal(h.opens.length, 2);
});

test("a call's first voice session that just drops seconds in is replaced once; a replacement that drops as fast ends the call", async (t) => {
  // erario's FedEx call (call_yo3oe3t4qkjnci9e): the socket closed 10s in with no session.closed or
  // error, and the call hung up; their next call to the same menu ran fine.
  const { h, live, said, line, marks } = await liveCall(t);
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  await said(live, 'them', 'Welcome to FedEx. This call may be monitored or recorded for quality assurance.');
  line(10_000, true);
  live.close();
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  assert.equal(shutdown.mock.callCount(), 0, 'the call stays up');
  assert.equal(h.session.live, next);
  assert.deepEqual(historyOf(next.sent[0]).slice(0, 1), ['user: Welcome to FedEx. This call may be monitored or recorded for quality assurance.']);
  assert.ok(marks().some((m) => /voice model socket closed: code/.test(m)), 'how the socket closed is logged');
  assert.ok(marks().some((m) => /voice session rolled over \(after its connection dropped\) at 10s session age/.test(m)));
  next.message({ type: 'session.started', session: { id: 'live_second' } });
  await settle();
  line(5_000, true);
  next.close();
  await settle();
  assert.equal(shutdown.mock.callCount(), 1);
  assert.equal(h.opens.length, 2);
});

test('a first voice session that sent an error before it dropped seconds in still ends the call', async (t) => {
  // While the API's credits ran out (Nov 16), every session said so and closed: a new one would too.
  t.mock.method(console, 'warn', () => {});
  const { h, live, said, line } = await liveCall(t);
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  await said(live, 'them', 'Hello?');
  line(3_000);
  live.message({ type: 'error', error: { code: 'credit_balance_exhausted', message: 'You have no credits remaining.' } });
  await settle();
  live.close();
  await settle();
  assert.equal(shutdown.mock.callCount(), 1);
  assert.equal(h.opens.length, 1);
});

const endCallFrom = (socket: Socket, delegation: string) =>
  socket.message({ type: 'response.event', delegation_id: delegation, event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: `end-${delegation}`, name: 'end_call', arguments: '{}' } } });

test("a rollover in a session's last minutes waits while its back office works, so the end_call it was handed still hangs up", async (t) => {
  const { h, live, said, line } = await liveCall(t);
  const hangups: string[] = [];
  h.session.hangup = async (why: string) => void hangups.push(why);
  await said(live, 'them', 'Okay, the refund went out yesterday. Anything else?');
  line(113 * MIN);
  await said(live, 'caller', "No, that's everything. Thanks so much, goodbye!");
  // The voice model hands end_call to the back office, and the line is quiet until its function
  // call comes back. Another delegation finishing meanwhile doesn't make the back office idle.
  live.message({ type: 'session.delegation.created', delegation: { id: 'd-end' } });
  live.message({ type: 'session.delegation.created', delegation: { id: 'd-note' } });
  live.message({ type: 'response.event', delegation_id: 'd-note', event: { type: 'response.completed' } });
  await settle();
  line(3_000);
  await h.session.alarm();
  line(2_000);
  assert.equal(h.opens.length, 1, 'no replacement while the back office works');
  endCallFrom(live, 'd-end');
  await settle();
  line(1_000);
  assert.deepEqual(hangups, ['the caller finished and said goodbye (end_call)']);
});

test('a replacement dialed just before the back office was handed something is dropped as it starts, and the old session finishes the work', async (t) => {
  const { h, live, said, line, marks } = await liveCall(t);
  const hangups: string[] = [];
  h.session.hangup = async (why: string) => void hangups.push(why);
  await said(live, 'them', 'Okay, the refund went out yesterday.');
  await said(live, 'caller', 'Great, thank you.');
  line(113 * MIN);
  await h.session.alarm();
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  live.message({ type: 'session.delegation.created', delegation: { id: 'd-end' } });
  await settle();
  next.message({ type: 'session.started', session: { id: 'live_second' } });
  await settle();
  assert.equal(h.session.live, live);
  assert.deepEqual(next.sent.at(-1), { type: 'session.close' });
  assert.ok(marks().some((m) => /replacement voice session dropped: the call moved on while it started/.test(m)));
  endCallFrom(live, 'd-end');
  await settle();
  line(1_000);
  assert.deepEqual(hangups, ['the caller finished and said goodbye (end_call)']);
});

test("in a session's last minute it rolls over at a quiet moment with the back office still at work, and a menu's wait for its key carries over", async (t) => {
  const { h, live, said, line } = await liveCall(t);
  h.session.setup.controlId = 'test-control';
  h.session.setup.inbandKeys = true;
  line(119 * MIN);
  await said(live, 'them', 'For billing, press 2.');
  live.message({ type: 'response.event', delegation_id: 'd-key', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'key-1', name: 'press_digits', arguments: '{"digits":"2"}' } } });
  await settle();
  // The key went in and the back office's next response is under way: expiring in under a minute,
  // the session would drop that response anyway.
  assert.equal(h.session.backOfficeBusy, true);
  line(2_000);
  await h.session.alarm();
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  next.message({ type: 'session.started', session: { id: 'live_second' } });
  await settle();
  assert.equal(h.session.live, next);
  // Still within the key's 8s wait for the menu's answer: the new session stays off the menu's line.
  const phoneBefore = h.phone.sent.length;
  next.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  assert.equal(h.phone.sent.length, phoneBefore);
  line(6_000);
  next.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  assert.deepEqual(h.phone.sent.at(-1), { event: 'media', media: { payload: 'AAAA' } });
});

test("the wrap-up notice that goes out as a replacement is dialed is in the history it starts with", async (t) => {
  const { h, live, said, line } = await liveCall(t);
  await said(live, 'them', 'Sure, let me read you the details.');
  await said(live, 'caller', 'Great, go ahead.');
  line(114 * MIN);
  // The heartbeat that dials the replacement then finds the call at its wrap-up point.
  h.values.set('wrapAt', Date.now());
  await h.session.alarm();
  await settle();
  assert.ok(live.sent.some((m) => m.type === 'session.thinking.append' && /Time is almost up/.test(m.content)), 'the session on the call gets it');
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  assert.match(historyOf(next.sent[0]).at(-1), /Time is almost up: about 40 seconds left\. Answer what they just said, then wrap up/);
  next.message({ type: 'session.started', session: { id: 'live_second' } });
  await settle();
  assert.equal(h.session.live, next);
});

test("the person's answer that comes in as a replacement starts drops it, and the next one is given the answer instead of none", async (t) => {
  const { h, live, said, line, marks } = await liveCall(t);
  await h.env.DB.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at) VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Example Clinic', 'Book a cleaning', '{}', 'in_progress', 0)`).run();
  h.session.setup.person = { name: 'Alex Kim' };
  h.session.setup.unattended = true;
  await said(live, 'them', 'What day works for the cleaning?');
  live.message({ type: 'response.event', delegation_id: 'd-ask', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'ask-1', name: 'ask_user', arguments: '{"question":"Which day works for the cleaning?"}' } } });
  await settle();
  live.message({ type: 'response.event', delegation_id: 'd-ask', event: { type: 'response.completed' } });
  await said(live, 'caller', "I don't have that yet. Can I call back to pick a day?");
  await said(live, 'them', 'Sure, no problem.');
  line(113 * MIN);
  await h.session.alarm();
  await h.untilOpened(2);
  const early = h.connected(1);
  await settle();
  assert.match(historyOf(early.sent[0]).at(-1), /No answer is available .*Which day works for the cleaning\?/);
  // Alex answers late, while it starts: the session on the call is told, and the replacement's history is out of date.
  await h.session.fetch(new Request('https://session/answer', { method: 'POST', body: JSON.stringify({ id: 'q-late', question: 'Which day works for the cleaning?', answer: 'Tuesday morning' }) }));
  assert.ok(live.sent.some((m) => m.type === 'session.commentary.append' && /Tuesday morning/.test(m.content)));
  assert.deepEqual(early.sent.at(-1), { type: 'session.close' });
  assert.ok(marks().some((m) => /replacement voice session dropped: the live session was told something while it started \(session\.commentary\.append\)/.test(m)));
  early.message({ type: 'session.started', session: { id: 'live_early' } });
  await settle();
  assert.equal(h.session.live, live);

  line(20_000);
  await h.session.alarm();
  await h.untilOpened(3);
  const next = h.connected(2);
  await settle();
  const note = historyOf(next.sent[0]).at(-1);
  assert.match(note, /Alex Kim answered "Which day works for the cleaning\?": Tuesday morning\. If you haven't passed that on yet/);
  assert.doesNotMatch(note, /No answer is available/);
  next.message({ type: 'session.started', session: { id: 'live_next' } });
  await settle();
  assert.equal(h.session.live, next);
});

test('words transcribed on hold while a replacement starts reach it once, as context, with only the line after them replayed', async (t) => {
  const { h, live, said, line } = await liveCall(t);
  await said(live, 'them', 'Please hold for the next available agent.');
  line(105 * MIN, true);
  await h.session.alarm();
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  const frames = (n: number, payload: string) => {
    for (let i = 0; i < n; i++) {
      h.phone.message({ event: 'media', media: { payload } });
      t.mock.timers.tick(20);
    }
  };
  // The queue's recording plays while it starts, and the old session transcribes it.
  frames(100, LOUD);
  await said(live, 'them', 'Your call is important to us.');
  t.mock.timers.tick(20);
  frames(30, QUIET);
  next.message({ type: 'session.started', session: { id: 'live_second' } });
  await settle();
  assert.equal(h.session.live, next);
  const replayed = next.sent.filter((m) => m.type === 'session.input_audio.append');
  assert.deepEqual(replayed, Array(30).fill({ type: 'session.input_audio.append', audio: QUIET }), 'not the recording it already has in words');
  const context = next.sent.filter((m) => m.type === 'session.thinking.append');
  assert.deepEqual(context.map((m) => m.content), ['While you were connecting, the call went on:\nthem: Your call is important to us.']);
});

test("a replacement session that starts keeps the call up through a phone stream reattaching around the replacement's deadline", async (t) => {
  const { h, live, said, line } = await liveCall(t);
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  await said(live, 'them', 'Leasing office, this is Sam.');
  line(2 * MIN);
  live.message({ type: 'session.closed', reason: 'expired' });
  await h.untilOpened(2);
  const next = h.connected(1);
  await settle();
  next.message({ type: 'session.started', session: { id: 'live_second' } });
  await settle();
  // 9s on, Telnyx drops the stream and reattaches it, and that stream's session is still starting 10s after the expiry.
  line(9_000);
  await h.session.phoneLost(h.phone, 'test loss');
  const phone = new Socket();
  h.session.attachPhone(phone);
  void h.session.streamAttached(phone);
  await h.untilOpened(3);
  h.connected(2);
  await settle();
  t.mock.timers.tick(3_000);
  await settle();
  assert.equal(shutdown.mock.callCount(), 0);
});

test('a voice session that drops while the open that installed it is still finishing gets a replacement of its own', async (t) => {
  const { h, live, said, line } = await liveCall(t);
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  await said(live, 'them', 'Leasing office, this is Sam.');
  line(2 * MIN);
  // The phone stream is lost and reattached; its new session's socket fails while the open still saves the call's time limit.
  await h.session.phoneLost(h.phone, 'test loss');
  const gate = deferred<void>();
  const startTimeLimit = h.session.startTimeLimit.bind(h.session);
  t.mock.method(h.session, 'startTimeLimit', async () => {
    await gate.promise;
    return startTimeLimit();
  });
  const phone = new Socket();
  h.session.attachPhone(phone);
  void h.session.streamAttached(phone);
  await h.untilOpened(2);
  const failing = h.connected(1);
  await settle();
  assert.equal(h.session.live, failing);
  failing.close();
  await settle();
  gate.resolve();
  await h.untilOpened(3);
  const next = h.connected(2);
  await settle();
  assert.equal(h.session.live, next);
  next.message({ type: 'session.started', session: { id: 'live_third' } });
  await settle();
  t.mock.timers.tick(10_000);
  await settle();
  assert.equal(shutdown.mock.callCount(), 0);
});

test("a replacement for a session that ended mid-call that can't be opened ends the call billed, as the session's end did before", async (t) => {
  for (const failure of ['refused', 'unreachable'] as const) {
    await t.test(failure, async (t) => {
      const { h, live, said, line } = await liveCall(t);
      const fail = t.mock.method(h.session, 'fail', async () => {});
      const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
      await said(live, 'them', 'Leasing office, this is Sam.');
      line(2 * MIN);
      live.message({ type: 'session.closed', reason: 'expired' });
      await h.untilOpened(2);
      h.opens[1].response.resolve(failure === 'refused' ? ({ status: 503, webSocket: null, text: async () => 'over capacity' } as any) : Promise.reject(new Error('network down')));
      await settle();
      assert.equal(fail.mock.callCount(), 0, 'not failed, which bills nothing');
      assert.equal(shutdown.mock.callCount(), 1);
      assert.match(String(shutdown.mock.calls[0].arguments[0]), /could not open GPT-Live: .*replacing the voice session that ended \(expired\)/);
    });
  }
});

test("an expires_at that can't be right is planned around as GPT-Live's two hours", async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const h = harness(t);
  const now = Date.now();
  assert.equal(h.session.sessionEndsAt({ id: 'ms', expires_at: now + 7_200_000 }, now), now + 7_200_000, 'in milliseconds: some 55,000 years out');
  assert.equal(h.session.sessionEndsAt({ id: 'past', expires_at: now / 1000 - 30 }, now), now + 7_200_000);
  assert.equal(h.session.sessionEndsAt({ id: 'half', expires_at: now / 1000 + 1_800 }, now), now + 1_800_000, 'a shorter limit it reports is believed');
  assert.ok(log.mock.calls.some((c: any) => /voice session ms expires_at \d+ is \d+s from its start; planning on 7200s/.test(String(c.arguments[0]))));
});

test('keys pressed before a session reset are in the history of the session that picks the call up', async (t) => {
  const h = harness(t);
  h.session.setup.controlId = 'test-control';
  h.session.setup.inbandKeys = true;
  h.session.live = new Socket();
  await h.session.onLive(JSON.stringify({ type: 'session.input_transcript.delta', delta: 'For billing, press 1.' }));
  await h.session.runTool({ call_id: 'key-1', name: 'press_digits', arguments: '{"digits":"1"}' });
  await h.session.env.DB.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at, transcript)
    VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Test utility', 'Billing question', '{}', 'in_progress', 8000, 8500, ?)`)
    .bind(JSON.stringify([{ role: 'them', text: 'For billing, press 1.', at: 9000 }])).run();
  h.values.set('setup', h.session.setup);
  h.values.set('liveStarted', true);
  const restarted = new VoiceSession(h.session.ctx, h.session.env) as any;
  const phone = new Socket();
  restarted.attachPhone(phone);
  const attached = restarted.streamAttached(phone);
  await h.untilOpened(1);
  const live = h.connected(0);
  await attached;
  assert.match(live.sent[0].session.input.at(-1).content[0].text, /Keys pressed on this call so far:\n1\. Keypad submitted: 1\. Prompt: For billing, press 1\./);
});

test('the call so far fits GPT-Live startup limits, keeping its first lines and its latest', async () => {
  const { resumeInput, tokens } = await import('../src/server/voice/person');
  const now = 10 * 60 * MIN;
  const first = [
    { role: 'them' as const, text: 'Thank you for calling American Airlines. For reservations, press 1.', at: 1 },
    { role: 'note' as const, text: 'carrier detected a live person', at: 2 },
    { role: 'caller' as const, text: 'Reservations.', at: 3 },
    { role: 'them' as const, text: 'Please say or enter your confirmation code.', at: 4 },
    { role: 'caller' as const, text: 'K X 7 4 Q 2.', at: 5 },
    { role: 'them' as const, text: 'Thank you. Please hold for the next available agent. '.repeat(3_000) + 'Your estimated wait is 40 minutes.', at: 6 },
  ];
  const middle = Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? ('caller' as const) : ('them' as const), text: `line ${i}: ${'blah '.repeat(40)}`, at: 100 + i }));
  // One last line in Japanese, a character to a token or more.
  const last = { role: 'them' as const, text: 'お待たせいたしました。'.repeat(200), at: 1_000 };
  const input = resumeInput({ transcript: [...first, ...middle, last], holdSince: now - 100 * MIN, keys: '1. Keypad submitted: 1. Prompt: For reservations, press 1.', standing: ['No answer is available from the person you work for about "Which seat?".'], now });
  assert.ok(input.length <= 128);
  const total = input.reduce((n, m) => n + tokens(m.content[0].text) + 4, 0);
  assert.ok(total <= 6_000, `${total} estimated tokens`);
  assert.deepEqual(input.slice(0, 5).map((m) => `${m.role}: ${m.content[0].text}`), [
    'user: Thank you for calling American Airlines. For reservations, press 1.',
    'developer: note: carrier detected a live person',
    'assistant: Reservations.',
    'user: Please say or enter your confirmation code.',
    'assistant: K X 7 4 Q 2.',
  ]);
  // The hold's one huge line keeps its end.
  assert.match(input[5].content[0].text, /^…/);
  assert.match(input[5].content[0].text, /Your estimated wait is 40 minutes\.$/);
  assert.ok(tokens(input[5].content[0].text) <= 400);
  assert.match(input[6].content[0].text, /^\(\d+ more lines of the call came here, left out for length\.\)$/);
  assert.equal(input.at(-2)!.role, 'user');
  assert.match(input.at(-2)!.content[0].text, /^….*(お待たせいたしました。){30}$/u);
  assert.ok(tokens(input.at(-2)!.content[0].text) <= 400);
  assert.match(input.at(-3)!.content[0].text, /^line 399:/, 'the newest lines, in order');
  const note = input.at(-1)!;
  assert.equal(note.role, 'developer');
  assert.match(note.content[0].text, /on hold 100 minutes ago/);
  assert.match(note.content[0].text, /Keys pressed on this call so far:\n1\. Keypad submitted: 1\./);
  assert.match(note.content[0].text, /No answer is available from the person you work for about "Which seat\?"/);

  // A short call goes in whole, with nothing marked left out.
  const short = resumeInput({ transcript: first.slice(0, 5), holdSince: null, keys: '(no keypad input has been submitted)', standing: [], now });
  assert.equal(short.length, 6);
  assert.doesNotMatch(short.at(-1)!.content[0].text, /on hold/);
});

// The Academe at 198: the carrier's detection said a person answered, 4s into the greeting.
const academe = (msgAt: number) => [
  { role: 'them' as const, text: 'Thank you, and we look forward to welcoming you. Please leave a message after the tone. When you have finished, please hang up or press the pound key for more options', at: msgAt - 17_000 },
  { role: 'caller' as const, text: "Hi, this is Alex Kim's assistant, calling to ask about studio availability and parking. You can reach us at four one five, five five five, zero one two three. Thanks!", at: msgAt },
];

test('a message left after a greeting that asked for one ends the call even when the carrier said a person answered', async (t) => {
  const h = harness(t);
  h.session.live = new Socket();
  await h.session.machineDetected('human', new Date(Date.now()).toISOString());
  assert.equal(h.session.machineState.phase, 'human');
  t.mock.timers.tick(100_000);
  const msgAt = Date.now() - 60_000;
  h.session.transcript.push(...academe(msgAt));
  h.session.lastTranscriptAt = msgAt;
  h.session.speechEndsAt = msgAt + 14_000; // 46s of quiet since the message ended
  h.session.checkMissedHandoff();
  assert.ok(h.session.live.sent.some((m: any) => /left its voicemail message/.test(m.item?.content?.[0]?.text ?? '')), 'hands off end_call');
});

// Episcopal Community Services: the carrier said a person answered its menu, which ended in a
// recording turning the call away. Our caller's message after it was held open 15 more minutes.
test('a message left after a recording that turned the call away ends the call, and the hold with it', async (t) => {
  const h = harness(t);
  h.session.live = new Socket();
  await h.session.machineDetected('human', new Date(Date.now()).toISOString());
  t.mock.timers.tick(100_000);
  const msgAt = Date.now() - 60_000;
  const recording = "Your call is very important to us. Please hold on the line and our ambassador will take your call shortly. Our apologies, we can't take your call right now. Please give us a call back. You can also email us at help at example dot org.";
  assert.equal(h.session.hold.them('Your call is very important to us. ', msgAt - 40_000)?.type, 'start');
  assert.equal(h.session.hold.them(recording.slice('Your call is very important to us. '.length), msgAt - 20_000)?.type, 'end');
  h.session.transcript.push(
    { role: 'them' as const, text: recording, at: msgAt - 40_000 },
    { role: 'caller' as const, text: "Hi, this is Alex Kim's assistant asking about studios. You can call us back at four one five, five five five, zero one two three. Thanks so much.", at: msgAt },
  );
  h.session.lastTranscriptAt = msgAt;
  h.session.speechEndsAt = msgAt + 10_000; // 50s of quiet since the message ended
  h.session.checkMissedHandoff();
  assert.ok(h.session.live.sent.some((m: any) => /left its voicemail message/.test(m.item?.content?.[0]?.text ?? '')), 'hands off end_call');
});

test('a key pressed after a recording turned the call away waits out the ringing it started, and a dead line after it still ends', async (t) => {
  // Balthazar's closed reservations line, 2026-11-14: 7 rang the reservationists, and the turn-away
  // before it was taken for their goodbye on the eighth ring.
  const h = harness(t);
  h.session.live = new Socket();
  // Counted at the session: three quiet minutes replace the phone stream, and its live socket with it.
  const sent = t.mock.method(h.session, 'sendLive');
  await h.session.machineDetected('machine', new Date(Date.now()).toISOString());
  t.mock.timers.tick(100_000);
  const closed = "You have reached the reservations line. We are currently closed. If you are looking to make a reservation for tonight, please press seven for assistance. Otherwise, please call back during our office hours, which are from 10 AM to 9 PM daily.";
  h.session.transcript.push({ role: 'them', text: closed, at: Date.now() });
  h.session.menuRecovery.observe(closed, Date.now());
  h.session.lastTranscriptAt = Date.now();
  t.mock.timers.tick(2_500);
  h.session.menuRecovery.submitted('7', h.session.menuRecovery.snapshot(), Date.now());
  const goodbyes = () => sent.mock.calls.filter((c: any) => /a recording said nobody can take the call/.test(c.arguments[0].item?.content?.[0]?.text ?? '')).length;
  for (let ring = 0; ring < 15; ring++) {
    h.session.themAudibleAt = Date.now(); // ringback: 2s on, 4s off
    t.mock.timers.tick(6_000);
    h.session.checkMissedHandoff();
  }
  assert.equal(goodbyes(), 0, 'a ringing line is not a silent one');
  t.mock.timers.tick(46_000); // the session's UNANSWERED_MS of quiet
  assert.equal(goodbyes(), 1, 'once the ringing stops and the line stays dead, the call ends');
});

test('a greeting that asked for a message and went quiet gets the message without a beep, only once the line is quiet', async (t) => {
  const h = harness(t);
  const live = (h.session.live = new Socket());
  await h.session.machineDetected('machine', new Date(Date.now()).toISOString());
  t.mock.timers.tick(100_000);
  const greetingAt = Date.now() - 3_000;
  h.session.transcript.push({ role: 'them', text: 'Votre correspondant ne peut recevoir votre appel. Veuillez laisser un message après le signal sonore.', at: greetingAt });
  h.session.lastTranscriptAt = greetingAt;
  const forced = () => live.sent.filter((m: any) => /recording now, even though no beep/.test(m.item?.content?.[0]?.text ?? '')).length;
  h.session.themAudibleAt = Date.now() - 2_000; // its last words played after their transcript landed
  h.session.checkMissedHandoff();
  assert.equal(forced(), 0, 'the greeting may still be going');
  t.mock.timers.tick(2_600);
  assert.equal(forced(), 1, 'leaves the message once the greeting has been quiet 4s');
  h.session.backOfficeBusy = false;
  h.session.checkMissedHandoff();
  assert.equal(forced(), 1, 'asked once');
});

test("a call screener that asks for a message after the person didn't come gets one", async (t) => {
  const h = harness(t);
  const live = (h.session.live = new Socket());
  await h.session.machineDetected('screening_prompt_ended', new Date(Date.now()).toISOString());
  assert.equal(h.session.machineState.phase, 'screening');
  t.mock.timers.tick(100_000);
  const at = Date.now() - 6_000;
  h.session.transcript.push(
    { role: 'caller', text: 'Hi, Alex from Example Co for Michael, about his website.', at: at - 11_000 },
    { role: 'them', text: "Thanks, Michael. Please stay on the line I'm sorry, this person is not available. If you would like to leave an additional message, please reply after the tone", at },
  );
  h.session.hold.them('Thanks, Michael. Please stay on the line', at);
  h.session.lastTranscriptAt = at;
  h.session.checkMissedHandoff();
  assert.ok(live.sent.some((m: any) => /recording now, even though no beep/.test(m.item?.content?.[0]?.text ?? '')));
});

test("screening detection right after a voicemail's greeting is its beep: the caller leaves the message now", async (t) => {
  const h = harness(t);
  const live = (h.session.live = new Socket());
  h.session.liveReady = true;
  await h.session.machineDetected('machine', new Date(Date.now()).toISOString());
  h.session.transcript.push({ role: 'them', text: 'The number you have reached, four one five, five five five, zero one nine nine, is not available', at: Date.now() });
  t.mock.timers.tick(5_000);
  await h.session.machineDetected('screening_prompt_ended', new Date(Date.now()).toISOString());
  assert.equal(h.session.machineState.phase, 'voicemail');
  const guidance = live.sent.filter((m: any) => m.type === 'session.commentary.append').map((m: any) => m.content);
  assert.match(guidance.at(-1), /The carrier detected a beep/);
  assert.ok(!guidance.some((g: string) => /call screener is ready/.test(g)));
});

test('a greeting asking for a message is left to the caller when the carrier says a person answered', async (t) => {
  const h = harness(t);
  h.session.live = new Socket();
  await h.session.machineDetected('human', new Date(Date.now()).toISOString());
  t.mock.timers.tick(100_000);
  const at = Date.now() - 10_000;
  h.session.transcript.push({ role: 'them', text: "She's out today, do you want to leave a message?", at });
  h.session.lastTranscriptAt = at;
  h.session.checkMissedHandoff();
  assert.ok(!h.session.live.sent.some((m: any) => /recording now/.test(m.item?.content?.[0]?.text ?? '')));
});

test('a callback request a person heard is not taken for a voicemail, however long they go quiet', async (t) => {
  const h = harness(t);
  h.session.live = new Socket();
  await h.session.machineDetected('human', new Date(Date.now()).toISOString());
  t.mock.timers.tick(100_000);
  const msgAt = Date.now() - 60_000;
  h.session.transcript.push(
    { role: 'them', text: "Leasing office, this is Dana. We don't have any studios open right now, let me check what's coming up.", at: msgAt - 10_000 },
    { role: 'caller', text: 'Sure, and if anything opens up, please call us back at four one five, five five five, zero one two three. Thanks!', at: msgAt },
  );
  h.session.lastTranscriptAt = msgAt;
  h.session.speechEndsAt = msgAt + 8_000;
  h.session.checkMissedHandoff();
  assert.ok(!h.session.live.sent.some((m: any) => /left its voicemail message/.test(m.item?.content?.[0]?.text ?? '')));
});

const promiseHandoffs = (live: Socket) => live.sent.filter((m) => m.type === 'response.item.create' && /said it would do something but never handed it off/.test(m.item.content[0].text)).map((m) => m.item.content[0].text);

test("a German goodbye the voice model never handed off is handed off once the line goes quiet, not 46s later", async (t) => {
  // call_2tu8ltcnltknt45z, 2026-11-15 (owner renamed): "Tschüss!" and their "Ja, danke, tschüss" were
  // unknown words, and the silent line waited for signedOff's 45s.
  const { live, play, words } = await outboundPickup(t);
  let ms = 0;
  const turn = async (role: 'them' | 'caller', text: string) => { await words(role, text); await play((ms += 3_000)); };
  await turn('them', 'Ja, hallo');
  await turn('caller', 'Hi, guten Tag! Ich hätte nur ne kurze Frage: Wie ist denn gerade das Wetter bei euch in Zypern?');
  await turn('them', 'Also die Sonne scheint und das Meer ist blau. Wer sind Sie denn überhaupt');
  await turn('caller', 'Ach schön, das freut mich zu hören. Ich bin der Assistent von Alex Kim, wir rufen nur kurz an, um nachzufragen, wie es Ihnen geht.');
  await turn('them', "Wie geht's ganz wunderbar! Und dir so");
  assert.deepEqual(promiseHandoffs(live), [], '"guten Tag" opens a call');
  await words('caller', "Oh, mega gut. Mir geht's auch gut, danke. Vielen Dank und dann noch nen schönen Tag für Sie. Tschüss!");
  await play((ms += 1_000));
  await words('them', 'Ja, danke, tschüss');
  await play((ms += 1_400));
  assert.deepEqual(promiseHandoffs(live), [], 'their closing is still landing');
  await play((ms += 200));
  assert.equal(promiseHandoffs(live).length, 1);
  assert.match(promiseHandoffs(live)[0], /them: Ja, danke, tschüss/);
});

test('a French voicemail message ending "Je raccroche." is handed off once the line goes quiet, not after 45s', async (t) => {
  // call_xogq1dyai72r5qp7, 2026-11-13 (names and number changed): a receptionist transferred us to
  // voicemail, the carrier had called the line a person, and the silent line stayed open 68s.
  const { h, live, play, words } = await outboundPickup(t);
  await h.session.machineDetected('human', new Date(Date.now()).toISOString());
  await words('them', "D'accord. N'est pas disponible. Veuillez laisser un message après la tonalité.");
  await play(5_000);
  await words('caller', "Bonjour, c'est l'assistante de Sam Martin. S'il vous plaît, rappelez Sam au cinq cinq cinq, zéro un deux trois, avec vos disponibilités. Merci. Je raccroche.");
  await play(6_400);
  assert.deepEqual(promiseHandoffs(live), []);
  await play(6_600);
  assert.equal(promiseHandoffs(live).length, 1);
});

test('a question that goes unanswered reaches the voice session that replaced the one asking, and any opened later', async (t) => {
  const h = harness(t);
  await h.session.env.DB.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at) VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Example Apartments', 'Studio rent', '{}', 'in_progress', 0)`).run();
  const first = h.session.startLive();
  await h.untilOpened(1);
  h.connected(0);
  await first;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'asking' } }));
  const asking = h.session.askUser(h.session.setup, "What is the household's annual income?");
  for (let i = 0; i < 20 && !h.session.waiting.size; i++) await Promise.resolve();
  // The phone stream is lost while the question is out, and the one that replaces it gets a new voice session.
  await h.session.phoneLost(h.phone, 'test loss');
  const phone = new Socket();
  h.session.attachPhone(phone);
  const attached = h.session.streamAttached(phone);
  await h.untilOpened(2);
  const replacement = h.connected(1);
  await attached;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'replacement' } }));
  t.mock.timers.tick(120_000);
  assert.match(await asking, /No answer is available/);
  assert.ok(replacement.sent.some((m: any) => m.type === 'session.commentary.append' && /No answer is available .*household's annual income/.test(m.content)), 'the replacement is told');
  // And a session opened after that has it in its instructions.
  await h.session.phoneLost(phone, 'test loss');
  const later = new Socket();
  h.session.attachPhone(later);
  const reattached = h.session.streamAttached(later);
  await h.untilOpened(3);
  const third = h.connected(2);
  await reattached;
  assert.match(third.sent[0].session.input.at(-1).content[0].text, /No answer is available .*household's annual income/);
});

test('forgetting a zero data retention call deletes its setup after it ended, and refuses one still on the phone', async (t) => {
  const h = harness(t);
  // The call is up with a phone stream attached: its setup still has work to do.
  assert.equal((await h.session.fetch(new Request('https://session/forget', { method: 'POST' }))).status, 409);

  // An hour later the instance has been evicted: the setup exists only in storage, and no socket
  // is left, so the purge must be able to delete it (and the PINs it holds).
  await h.storage.put('setup', h.session.setup);
  const restarted = new VoiceSession({ storage: h.storage, waitUntil() {} } as any, h.env);
  assert.equal((await restarted.fetch(new Request('https://session/forget', { method: 'POST' }))).status, 200);
  assert.equal(restarted.setup, null);
  assert.equal(h.values.size, 0);
});

test("an incoming call's voice session starts on the socket dialed while its setup was being read, and the call is answered before it has started", async (t) => {
  // Prod callers hung up 3.0s and 3.4s into the ringing while we took 2.5-3.9s to pick up; GPT-Live's
  // socket alone took 0.1-0.7s of that, after the setup's reads. Waiting on session.started too,
  // call_um9umnbavygg7u6z (2026-11-18) was answered 3.0s in, after its caller hung up 2.5s in: the
  // session starts (median 0.7s) while Telnyx picks up and connects the phone (median 1.5s).
  const h = harness(t);
  const setup = { ...h.session.setup, answering: true };
  h.session.setup = null;
  h.session.answered = false;
  h.session.answeredAt = 0;
  h.session.phone = null;
  await h.session.fetch(new Request('https://session/preconnect', { method: 'POST' }));
  await h.untilOpened(1);
  await h.session.fetch(new Request('https://session/setup', { method: 'POST', body: JSON.stringify(setup) }));
  const prewarm = h.session.fetch(new Request('https://session/prewarm', { method: 'POST' }));
  const live = h.connected(0);
  assert.equal(await (await prewarm).text(), 'starting');
  assert.equal(live.sent[0].type, 'session.start');
  assert.equal(live.sent[0].session.instructions, 'Test instructions');
  assert.equal(h.opens.length, 1, 'no second dial');

  // Picked up, the phone's audio arrives before the session has started: it waits, as does the greeting.
  await h.session.fetch(new Request('https://session/answered', { method: 'POST' }));
  const stream = new Socket();
  h.session.attachPhone(stream);
  await h.session.streamAttached(stream);
  stream.message({ event: 'media', media: { payload: 'hello-audio' } });
  t.mock.timers.tick(1);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(live.sent.map((m) => m.type), ['session.start']);
  assert.equal(h.opens.length, 1, 'pickup and the stream reuse the open session');

  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'ringing' } }));
  t.mock.timers.tick(1);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(live.sent.find((m) => m.type === 'session.input_audio.append'), { type: 'session.input_audio.append', audio: 'hello-audio' });
  assert.ok(live.sent.some((m) => m.type === 'session.instructions.append' && /You just picked up their call/.test(m.content)), 'greeted once the session started');
});

test("an incoming call's stream attaching just before the answered webhook is not taken for a restarted session", async (t) => {
  // call_a5sdu8cc7r4ix82w (2026-11-18): the session started while it rang, the stream attached, and
  // the call row was already answered when the answered webhook reached the session.
  const h = harness(t);
  const setup = { ...h.session.setup, answering: true };
  h.session.setup = null;
  h.session.answered = false;
  h.session.answeredAt = 0;
  h.session.phone = null;
  await h.env.DB.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at) VALUES ('recovery_test', 'acct_alice', '+14155550100', 'Callback', 'Take a message', '{}', 'in_progress', 0, ?)`).bind(Date.now()).run();
  await h.session.fetch(new Request('https://session/setup', { method: 'POST', body: JSON.stringify(setup) }));
  const prewarm = h.session.fetch(new Request('https://session/prewarm', { method: 'POST' }));
  await h.untilOpened(1);
  const live = h.connected(0);
  await prewarm;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'ringing' } }));
  const stream = new Socket();
  h.session.attachPhone(stream);
  await h.session.streamAttached(stream);
  assert.equal(h.session.resumed, false);
  assert.equal(h.session.heardThem, false);
  await h.session.fetch(new Request('https://session/answered', { method: 'POST' }));
  t.mock.timers.tick(1);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.ok(live.sent.some((m) => m.type === 'session.instructions.append' && /You just picked up their call/.test(m.content)), 'greeted as a new call');
});

test('an incoming call whose voice session could not be opened is answered at once, not after the prewarm wait', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const h = harness(t);
  const setup = { ...h.session.setup, answering: true };
  h.session.setup = null;
  h.session.answered = false;
  h.session.answeredAt = 0;
  h.session.phone = null;
  await h.session.fetch(new Request('https://session/setup', { method: 'POST', body: JSON.stringify(setup) }));
  const prewarm = h.session.fetch(new Request('https://session/prewarm', { method: 'POST' }));
  await h.untilOpened(1);
  h.opens[0].response.resolve({ status: 503, webSocket: null, text: async () => 'unavailable' } as any);
  let returned = false;
  void prewarm.then(() => { returned = true; });
  for (let i = 0; i < 50 && !returned; i++) await Promise.resolve();
  assert.equal(returned, true, 'no 2.5s of ringing on a session that will not open');
  assert.equal(await (await prewarm).text(), 'not open');
});

test('a call that is not picked up closes the socket dialed for it, and aborts one still dialing', async (t) => {
  const h = harness(t);
  h.session.setup = null;
  h.session.answered = false;
  await h.session.fetch(new Request('https://session/preconnect', { method: 'POST' }));
  await h.untilOpened(1);
  const dialed = h.connected(0);
  await h.session.fetch(new Request('https://session/ended', { method: 'POST' }));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(dialed.readyState, 3);
  assert.deepEqual(dialed.sent, []);

  const other = new VoiceSession({ storage: h.storage, waitUntil() {} } as any, h.env) as any;
  let signal!: AbortSignal;
  t.mock.method(globalThis, 'fetch', (_input: unknown, init: RequestInit) => {
    signal = init.signal!;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  await other.fetch(new Request('https://session/preconnect', { method: 'POST' }));
  await other.fetch(new Request('https://session/ended', { method: 'POST' }));
  assert.equal(signal.aborted, true);
  // Once ended, a late preconnect dials nothing.
  await other.fetch(new Request('https://session/preconnect', { method: 'POST' }));
  assert.equal(other.preconnected, null);
});

test('a voicemail message ending with a goodbye is ended by the voicemail check, not taken for an unkept promise', async (t) => {
  // call_qsucw4yvaz1j82ra, 2026-11-16 (renamed): the promise check took the message's "Bye." while
  // the voicemail check waited for quiet, and the line stayed open 7 minutes after the message.
  const { h, live, play, words } = await outboundPickup(t);
  await h.session.machineDetected('machine', new Date(Date.now()).toISOString());
  await words('them', 'Your call is being transferred. Please hold. The party you are trying to reach is not available to take your call. Please leave a message after the tone. Press the pound key to end recording');
  await play(2_500);
  await words('caller', "Hi, this is Alex Kim's assistant. I'm calling to ask about studio availability and parking. If you could call me back at four one five, five five five, zero one two three, that would be great. Thanks so much. Bye.");
  await play(4_100);
  assert.deepEqual(promiseHandoffs(live), [], 'not an unkept promise while the voicemail check waits out its quiet');
  await play(9_000);
  const left = live.sent.filter((m) => m.type === 'response.item.create' && /left its voicemail message/.test(m.item.content[0].text));
  assert.equal(left.length, 1, 'once the line is quiet, the message ends the call');
  assert.deepEqual(promiseHandoffs(live), []);
});

test("on an automated line the caller's filler never reaches the phone or the transcript, and its answer does; with a person it plays", async (t) => {
  // Kate's call to GE Appliances (call_ldb8bzvlopko2yzl): "Okay. Schedule a repair." got "Sorry, I didn't get that."
  const turn = async (h: Awaited<ReturnType<typeof outboundPickup>>) => {
    const media = () => h.h.session.phone.sent.filter((m: any) => m.event === 'media' && m.media.payload === LOUD).length;
    await h.words('them', 'How can I help you today? You can say things like, purchase a new appliance, schedule a repair, or something else.');
    await h.words('caller', ' Okay.');
    await h.play(600, (ms) => ({ caller: ms >= 200 && ms < 500 }));
    const afterFiller = media();
    await h.words('caller', ' Schedule');
    await h.play(900, (ms) => ({ caller: ms >= 700 }));
    await h.words('caller', ' a repair.');
    await h.play(1_600, (ms) => ({ caller: ms < 1_500 }));
    const said = h.h.session.transcript.filter((l: any) => l.role === 'caller').map((l: any) => l.text).join(' ');
    return { afterFiller, total: media(), said };
  };
  const machine = await outboundPickup(t);
  await machine.h.session.machineDetected('machine', new Date(Date.now()).toISOString());
  const automated = await turn(machine);
  assert.equal(automated.afterFiller, 0, '"Okay." is kept off the line');
  assert.equal(automated.total, 40, 'the answer plays in full');
  assert.equal(automated.said, 'Schedule a repair.');
  t.mock.timers.reset();
  const human = await outboundPickup(t);
  await human.h.session.machineDetected('human', new Date(Date.now()).toISOString());
  const person = await turn(human);
  assert.equal(person.afterFiller, 15, 'to a person, "okay" plays as it is said');
  assert.equal(person.said, 'Okay. Schedule a repair.');
});

test("before the carrier knows who answered, a backchannel over their greeting stays off the line until the caller's first word", async (t) => {
  // call_67h6k5zknkes4ha6: "Mm-hmm" over GE's greeting at +2.8s; the carrier heard a machine at +3.9s.
  const { h, play, words } = await outboundPickup(t);
  const media = () => h.session.phone.sent.filter((m: any) => m.event === 'media' && m.media.payload === LOUD).length;
  await words('them', 'Thank you for calling GE');
  await words('caller', ' Mm-hmm.');
  await play(500, (ms) => ({ them: true, caller: ms >= 200 && ms < 400 }));
  assert.equal(media(), 0);
  await words('them', ' Appliances.');
  await words('caller', ' Hi, I have a question about a repair.');
  await play(1_500, (ms) => ({ caller: ms >= 800 && ms < 1_400 }));
  assert.equal(media(), 30);
  await words('caller', ' Okay.');
  await play(2_000, (ms) => ({ caller: ms >= 1_700 && ms < 1_900 }));
  assert.equal(media(), 40, 'once the caller is talking with them, its "okay" plays');
  assert.equal(h.session.transcript.filter((l: any) => l.role === 'caller').map((l: any) => l.text).join(' '), 'Hi, I have a question about a repair. Okay.');
});
