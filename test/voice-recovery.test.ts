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
  const connected = (index: number, ok = true) => {
    opens[index].response.resolve({ status: ok ? 101 : 503, webSocket: ok ? opens[index].socket : null, text: async () => 'test failure' } as any);
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

for (const succeeds of [true, false]) {
  test(`a replacement phone arriving during an old ${succeeds ? 'successful' : 'failed'} open gets its own session`, async (t) => {
    const h = harness(t);
    const first = h.session.startLive();
    await h.untilOpened(1);
    const replacement = new Socket();
    h.session.attachPhone(replacement);
    const next = h.session.startLive();
    assert.equal(first, next, 'connection work stays serialized');
    const stale = h.connected(0, succeeds);
    await h.untilOpened(2);
    const live = h.connected(1);
    await next;
    assert.equal(h.session.live, live);
    assert.equal(h.session.ended, false);
    assert.deepEqual(stale.sent, []);
    assert.equal(live.sent[0].type, 'session.start');
  });
}

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

test('a call ending during connection closes the late socket without starting it', async (t) => {
  const h = harness(t);
  const starting = h.session.startLive();
  await h.untilOpened(1);
  await h.session.shutdown('test call ended');
  const late = h.connected(0);
  await starting;
  assert.equal(late.readyState, 3);
  assert.deepEqual(late.sent, []);
  assert.equal(h.session.live, null);
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
