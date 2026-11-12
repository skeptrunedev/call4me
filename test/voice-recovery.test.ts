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

test('a replacement phone arriving during an old open gets its own session', async (t) => {
  const h = harness(t);
  const first = h.session.startLive();
  await h.untilOpened(1);
  const replacement = new Socket();
  h.session.attachPhone(replacement);
  const next = h.session.startLive();
  assert.equal(first, next, 'connection work stays serialized');
  const stale = h.connected(0);
  await h.untilOpened(2);
  const live = h.connected(1);
  await next;
  assert.equal(h.session.live, live);
  assert.equal(h.session.ended, false);
  assert.deepEqual(stale.sent, []);
  assert.equal(live.sent[0].type, 'session.start');
});

test('late model and phone events cannot affect a recovered call', async (t) => {
  const h = harness(t);
  const first = h.session.startLive();
  await h.untilOpened(1);
  const oldLive = h.connected(0);
  await first;
  await h.session.onLive(JSON.stringify({ type: 'session.started', session: { id: 'old' } }));
  oldLive.message({ type: 'session.input_transcript.delta', delta: 'Please wait while I check.' });
  const replacement = new Socket();
  h.session.attachPhone(replacement);
  const next = h.session.startLive();
  await h.untilOpened(2);
  const live = h.connected(1);
  await next;
  assert.match(live.sent[0].session.instructions, /Please wait while I check/);
  assert.equal(h.values.get('wrapAt'), 1_165_000, 'recovery keeps the original call deadline');
  const shutdown = t.mock.method(h.session, 'shutdown', async () => {});
  const messagesBefore = live.sent.length;
  h.phone.message({ event: 'stop' });
  h.phone.message({ event: 'media', media: { payload: 'stale' } });
  oldLive.message({ type: 'session.closed', reason: 'expired' });
  oldLive.message({ type: 'session.output_audio.delta', delta: 'AAAA' });
  oldLive.message({ type: 'session.input_transcript.delta', delta: 'stale words' });
  oldLive.message({ type: 'session.started', session: { id: 'stale' } });
  assert.equal(shutdown.mock.callCount(), 0);
  assert.equal(h.session.liveReady, false, 'old session.started cannot ready a replacement');
  assert.equal(live.sent.length, messagesBefore);
  assert.deepEqual(replacement.sent, []);
  assert.doesNotMatch(JSON.stringify(h.session.transcript), /stale words/);
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

test('the time limit never hangs up on the user while they are on the call, and wraps up once they hand it back', async (t) => {
  const h = harness(t);
  const hangups: string[] = [];
  h.session.hangup = async (why: string) => { hangups.push(why); };
  h.session.heardThem = true;
  h.session.personOn = true;
  h.values.set('stopAt', Date.now() - 1);
  await h.session.alarm();
  assert.deepEqual(hangups, []);
  assert.equal(h.values.get('stopAt'), undefined);
  assert.equal(h.values.get('wrapAt'), Date.now() + 60_000);

  // Handed back: the next check starts the usual wrap-up instead of waiting again.
  h.session.personOn = false;
  t.mock.timers.tick(60_000);
  await h.session.alarm();
  assert.equal(h.values.get('stopAt'), Date.now() + 40_000);
  assert.deepEqual(hangups, []);
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
  // A new phone stream replaces the voice session while the question is out.
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
  const later = new Socket();
  h.session.attachPhone(later);
  const reattached = h.session.streamAttached(later);
  await h.untilOpened(3);
  const third = h.connected(2);
  await reattached;
  assert.match(third.sent[0].session.instructions, /No answer is available .*household's annual income/);
});
