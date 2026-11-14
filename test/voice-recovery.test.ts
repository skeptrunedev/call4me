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
    setAlarm: async (at: number) => { values.set('alarm', at); },
    deleteAlarm: async () => { values.delete('alarm'); },
  };
  const session = new VoiceSession({ storage, waitUntil() {} } as any, { DB: d1(), OPENAI_API_KEY: 'test-key' } as any) as any;
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
  return { session, phone, opens, connected, untilOpened, values };
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
  assert.match(live.sent[0].session.instructions, /Please give me two minutes to check the order/);
  assert.equal(h.values.get('wrapAt'), 1_000_000);
  await restarted.onLive(JSON.stringify({ type: 'session.started', session: { id: 'restored' } }));
  phone.message({ event: 'media', media: { payload: 'new-phone-audio' } });
  live.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  assert.deepEqual(live.sent.at(-1), { type: 'session.input_audio.append', audio: 'new-phone-audio' });
  assert.deepEqual(phone.sent.at(-1), { event: 'media', media: { payload: 'AAAA' } });
});

test('once the user joins, the caller keeps talking and working, but never hangs up on them', async (t) => {
  const h = harness(t);
  const live = new Socket();
  h.session.live = live;
  h.session.liveReady = true;
  h.session.setup.person = { name: 'Alex Kim' };
  h.session.personLeg = 'person-leg';
  await h.session.personJoined();
  assert.match(JSON.stringify(live.sent.at(-1)), /Alex Kim has joined the call\..*Keep working on the task as before/);
  assert.ok(!h.phone.sent.some((m: any) => m.event === 'clear'), 'what the caller was saying is not cut off');
  await h.session.onLive(JSON.stringify({ type: 'session.output_audio.delta', delta: 'AAAA' }));
  assert.deepEqual(h.phone.sent.at(-1), { event: 'media', media: { payload: 'AAAA' } });

  const hangups: string[] = [];
  h.session.hangup = async (why: string) => { hangups.push(why); };
  await h.session.runTool({ call_id: 'bye', name: 'end_call', arguments: '{}' });
  assert.deepEqual(hangups, []);
  assert.match(JSON.stringify(live.sent.at(-1)), /Alex Kim is still on the call/);
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
  assert.match(third.sent[0].session.instructions, /No answer is available .*household's annual income/);
});
