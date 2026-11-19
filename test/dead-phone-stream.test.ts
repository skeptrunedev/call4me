// Gaido's Seafood (call_5hf6vtmo5p1d34is, 2026-11-12): after Telnyx reconnected the media stream at
// 18:02:37 the replacement stream died without a close reaching the session (Telnyx: streaming.failed
// "disconnected" at 18:03:07). The session kept the dead socket as its phone, heard none of the host's
// minute of talk, and sat silent until the time limit. Harness as in test/voice-recovery.test.ts.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { d1 } from './sqlite-d1';

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

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

function harness(t: TestContext, { attached = true } = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => { values.set(key, value); },
    delete: async (keys: string | string[]) => { for (const key of typeof keys === 'string' ? [keys] : keys) values.delete(key); },
    setAlarm: async (at: number) => { values.set('alarm', at); },
    deleteAlarm: async () => { values.delete('alarm'); },
  };
  t.mock.method(console, 'warn', () => {});
  const session = new VoiceSession({ storage, waitUntil() {} } as any, { DB: d1(), OPENAI_API_KEY: 'k' } as any) as any;
  session.setup = { callId: 'dead_stream_test', instructions: 'Test', backOffice: 'Tools', voice: 'marin', maxSeconds: 1200, redact: [] };
  session.answered = true;
  session.answeredAt = Date.now();
  session.transcriptComplete = true;
  session.live = new Socket();
  session.liveReady = true;
  const phone = new Socket();
  if (attached) session.attachPhone(phone);
  const frames = async (ms: number, reply = (_m: any) => {}) => {
    for (let at = 0; at < ms; at += 20) {
      phone.message({ event: 'media', media: { payload: '/w==' } });
      t.mock.timers.tick(20);
      await flush();
      for (const m of phone.sent.splice(0)) reply(m);
    }
  };
  const quiet = async (ms: number, reply = (_m: any) => {}) => {
    for (let at = 0; at < ms; at += 100) {
      t.mock.timers.tick(100);
      await flush();
      for (const m of phone.sent.splice(0)) reply(m);
    }
  };
  return { session, phone, values, frames, quiet };
}

test('a phone stream that goes dead mid-call without closing is given up and reattached', async (t) => {
  const h = harness(t);
  await h.frames(3_000);
  assert.equal(h.session.phone, h.phone);
  // Telnyx's side is gone: no frames, no close, and nothing answers.
  await h.quiet(8_000);
  assert.equal(h.session.phone, null, 'the dead socket is no longer the phone');
  assert.equal(h.session.live, null, 'its voice session is dropped with it');
  assert.ok(h.values.has('orphanSince'), 'the heartbeat reattaches the stream or ends the call');
});

test('a far end that stops sending audio keeps its stream when Telnyx still answers', async (t) => {
  const h = harness(t);
  await h.frames(3_000);
  // Silence suppression: no frames, but the stream is up and echoes every mark.
  await h.quiet(30_000, (m) => { if (m.event === 'mark') h.phone.message({ event: 'mark', mark: { name: m.mark.name } }); });
  assert.equal(h.session.phone, h.phone);
  assert.equal(h.values.has('orphanSince'), false);
});

// SoMa Square Apartments (call_ysgg915yqhzdoimc, 2026-11-17): no audio 4s after pickup, and Telnyx
// refused the reattach with "Limit of maximum concurrent bidirectional RTP streaming session
// reached (1)": the dead stream still held the call's one slot, and the call failed.
test("a dead stream is stopped before the call's stream is started again", async (t) => {
  const h = harness(t);
  const db = h.session.env.DB;
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at) VALUES ('dead_stream_test', 'acct_alice', '+14155550100', 'Test store', 'Ask', '{}', 'in_progress', 0, ?)`).bind(Date.now()).run();
  Object.assign(h.session.setup, { controlId: 'v3:control', streamUrl: 'wss://voice.call4.me/voice/stream/dead_stream_test/token' });
  const telnyx: { path: string; body: any }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    telnyx.push({ path, body: JSON.parse(String(init?.body ?? '{}')) });
    // Nothing left to stop is refused, and the stream starts anyway.
    if (path.endsWith('/streaming_stop')) return new Response(JSON.stringify({ errors: [{ detail: 'no stream to stop' }] }), { status: 422 });
    return new Response('{}', { status: 200 });
  });
  await h.frames(3_000);
  await h.quiet(8_000);
  assert.equal(h.session.phone, null);
  await h.session.alarm();
  assert.deepEqual(
    telnyx.map((r) => r.path),
    ['/v2/calls/v3%3Acontrol/actions/streaming_stop', '/v2/calls/v3%3Acontrol/actions/streaming_start'],
  );
  assert.deepEqual(telnyx[0].body, {}, 'every stream on the call, not one by id');
  assert.equal(telnyx[1].body.stream_url, 'wss://voice.call4.me/voice/stream/dead_stream_test/token');
});

// Gustavo (call_3tai2urataie5tve, 2026-11-18): the call rang out and its stream closed with it, and
// the heartbeat ran 1.2s after Telnyx's hang-up, before the hang-up had reached the call's row.
// Telnyx refused the stop and then the start as "no longer active", and the log read "reattach failed".
test('a stream that closed because the call ended is not started again', async (t) => {
  const h = harness(t);
  const db = h.session.env.DB;
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at) VALUES ('dead_stream_test', 'acct_alice', '+14155550100', 'Test store', 'Ask', '{}', 'in_progress', 0, ?)`).bind(Date.now()).run();
  Object.assign(h.session.setup, { controlId: 'v3:control', streamUrl: 'wss://voice.call4.me/voice/stream/dead_stream_test/token' });
  const telnyx: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    telnyx.push(new URL(String(input)).pathname);
    return new Response(JSON.stringify({ errors: [{ detail: "This call is no longer active and can't receive commands." }] }), { status: 422 });
  });
  await h.frames(3_000);
  await h.quiet(8_000);
  await h.session.alarm();
  assert.deepEqual(telnyx, ['/v2/calls/v3%3Acontrol/actions/streaming_stop']);
  assert.ok(h.values.get('alarm'), 'the next heartbeat still looks at the call');
});

// The ABC Store (call_9wnkn3unpc0gp1bp, 2026-11-18): the stream died 54ms after it connected, while
// the call rang. Telnyx refused the stop and the start as "has not been answered yet", which spent
// the call's one reattach, and the business answered into 9s of silence before the call failed.
test('a stream lost while the call rings is reattached when it is answered, not before', async (t) => {
  const h = harness(t);
  const db = h.session.env.DB;
  h.session.answered = false;
  h.session.answeredAt = 0;
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at) VALUES ('dead_stream_test', 'acct_alice', '+14155550100', 'Test store', 'Ask', '{}', 'dialing', 0)`).run();
  Object.assign(h.session.setup, { controlId: 'v3:control', streamUrl: 'wss://voice.call4.me/voice/stream/dead_stream_test/token' });
  let pickedUp = false;
  const telnyx: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    telnyx.push(path.replace('/v2/calls/v3%3Acontrol/actions/', ''));
    if (!pickedUp) return new Response(JSON.stringify({ errors: [{ detail: "This call can't receive streaming_start command because it has not been answered yet." }] }), { status: 422 });
    return new Response('{}', { status: 200 });
  });
  h.phone.close();
  await flush();
  assert.equal(h.session.phone, null);
  await h.session.alarm();
  assert.deepEqual(telnyx, [], 'nothing is asked of Telnyx while it rings');
  assert.ok(h.values.get('alarm'), 'the heartbeat keeps watching the ringing call');

  t.mock.timers.tick(8_000);
  pickedUp = true;
  await db.prepare(`UPDATE calls SET status = 'in_progress', answered_at = ? WHERE id = 'dead_stream_test'`).bind(Date.now()).run();
  await h.session.fetch(new Request('https://session/answered', { method: 'POST' }));
  assert.deepEqual(telnyx, ['streaming_stop', 'streaming_start'], 'pickup reattaches the stream at once');

  // One reattach per loss, and the call gets its full wait for the stream from the reattach.
  await h.session.alarm();
  assert.deepEqual(telnyx, ['streaming_stop', 'streaming_start']);
  const row = await db.prepare(`SELECT status FROM calls WHERE id = 'dead_stream_test'`).first();
  assert.equal(row.status, 'in_progress');
  // A stream that never comes back still ends the call, unbilled.
  t.mock.timers.tick(15_000);
  await h.session.alarm();
  const after = await db.prepare(`SELECT status, cost_cents FROM calls WHERE id = 'dead_stream_test'`).first();
  assert.equal(after.status, 'failed');
  assert.equal(after.cost_cents, 0);
});

// Century Center Garage (call_phs50yanv5i0fy3s, 2026-11-19): Telnyx's stream never connected
// (streaming.failed "connection_failed" 3s into dialing), so nothing reached the session to mark the
// audio lost. Pickup reattached nothing, and the business hung up on 8s of silence.
test('a stream that never connected is reattached when the call is answered', async (t) => {
  const h = harness(t, { attached: false });
  const db = h.session.env.DB;
  h.session.answered = false;
  h.session.answeredAt = 0;
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at) VALUES ('dead_stream_test', 'acct_alice', '+14155550100', 'Test store', 'Ask', '{}', 'dialing', 0)`).run();
  Object.assign(h.session.setup, { controlId: 'v3:control', streamUrl: 'wss://voice.call4.me/voice/stream/dead_stream_test/token' });
  const telnyx: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    telnyx.push(new URL(String(input)).pathname.replace('/v2/calls/v3%3Acontrol/actions/', ''));
    return new Response('{}', { status: 200 });
  });
  await h.session.fetch(new Request('https://session/stream-failed', { method: 'POST' }));
  assert.deepEqual(telnyx, [], 'nothing is asked of Telnyx while it rings');
  assert.ok(h.values.has('orphanSince'), 'the call is known to have no stream');

  t.mock.timers.tick(9_000);
  await db.prepare(`UPDATE calls SET status = 'in_progress', answered_at = ? WHERE id = 'dead_stream_test'`).bind(Date.now()).run();
  await h.session.fetch(new Request('https://session/answered', { method: 'POST' }));
  assert.deepEqual(telnyx, ['streaming_stop', 'streaming_start'], 'pickup starts the stream again');

  // As acceptStream takes the reattached stream.
  h.session.attachPhone(h.phone);
  await h.session.streamAttached(h.phone);
  assert.equal(h.session.phone, h.phone);
  assert.equal(h.values.has('orphanSince'), false, 'the stream is back');
});

// Mission Plaza Apartments (call_otkulez0v3d533k0, 2026-11-16): answered 2s in, its stream failed to
// connect 3s after that, and the call failed at 10s with no audio from the phone.
test('a stream that fails to connect after pickup is reattached at once', async (t) => {
  const h = harness(t, { attached: false });
  const db = h.session.env.DB;
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at) VALUES ('dead_stream_test', 'acct_alice', '+14155550100', 'Test store', 'Ask', '{}', 'in_progress', 0, ?)`).bind(Date.now()).run();
  Object.assign(h.session.setup, { controlId: 'v3:control', streamUrl: 'wss://voice.call4.me/voice/stream/dead_stream_test/token' });
  const telnyx: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    telnyx.push(new URL(String(input)).pathname.replace('/v2/calls/v3%3Acontrol/actions/', ''));
    return new Response('{}', { status: 200 });
  });
  await h.session.fetch(new Request('https://session/stream-failed', { method: 'POST' }));
  assert.deepEqual(telnyx, ['streaming_stop', 'streaming_start']);
  // Once per loss: a second failure report waits out the reattach instead of starting another.
  await h.session.fetch(new Request('https://session/stream-failed', { method: 'POST' }));
  assert.deepEqual(telnyx, ['streaming_stop', 'streaming_start']);
});

test("a failed stream's report changes nothing while another stream carries the call", async (t) => {
  const h = harness(t);
  await h.frames(1_000);
  const telnyx: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    telnyx.push(new URL(String(input)).pathname);
    return new Response('{}', { status: 200 });
  });
  await h.session.fetch(new Request('https://session/stream-failed', { method: 'POST' }));
  assert.deepEqual(telnyx, []);
  assert.equal(h.session.phone, h.phone);
  assert.equal(h.values.has('orphanSince'), false);
});
