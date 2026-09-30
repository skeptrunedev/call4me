import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';

// Only the platform base class is replaced. These tests run the real session and SDK.
const workerModule = `export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent(workerModule)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { CallSession } = await import('../src/server/voice/session');

class Socket {
  static OPEN = 1;
  readyState = 1;
  sent: unknown[] = [];
  accept() {}
  addEventListener() {}
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
}
Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type Ingest = { path: string; body: any };

function harness(t: TestContext, options: { key?: boolean; row?: Promise<unknown> } = {}) {
  const requests: Ingest[] = [];
  const lifetime: Promise<unknown>[] = [];
  const socket = new Socket();
  const row = options.row ?? Promise.resolve({ account_id: 'test_account', direction: 'outbound' });
  const env = {
    OPENAI_API_KEY: 'fake_openai_key',
    ...(options.key === false ? {} : { RAINDROP_WRITE_KEY: 'fake_raindrop_key', RAINDROP_PROJECT_ID: 'test-project' }),
    DB: { prepare(sql: string) {
      assert.equal(sql, 'SELECT * FROM calls WHERE id = ?');
      return { bind() { return { first() { return row; } }; } };
    } },
  };
  const ctx = {
    waitUntil(promise: Promise<unknown>) { lifetime.push(promise); },
    storage: { async setAlarm() {}, async deleteAlarm() {} },
  };
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === 'https://api.openai.com') return { status: 101, webSocket: socket } as unknown as Response;
    assert.equal(url.origin, 'https://api.raindrop.ai', 'no unmocked network traffic is allowed');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fake_raindrop_key');
    assert.equal(new Headers(init?.headers).get('x-raindrop-project-id'), 'test-project');
    requests.push({ path: url.pathname, body: JSON.parse(String(init?.body)) });
    return Response.json({ success: true });
  });
  // Private methods are exercised here to inject actual provider messages without a network socket.
  const session = new CallSession(ctx as any, env as any) as any;
  session.setup = { callId: 'test_call', instructions: 'Arrange a reservation', backOffice: 'Help the caller', voice: 'test', maxSeconds: 300, pricePerMinuteCents: 25, redact: ['private-pin'] };
  session.phone = new Socket();
  async function start() { await session.startLive(); }
  async function queue() { await session.monitoringQueue; }
  async function drain() {
    let settled = 0;
    while (settled < lifetime.length) {
      const current = lifetime.slice(settled);
      settled = lifetime.length;
      await Promise.all(current);
    }
  }
  async function shutdown() {
    // Avoid the real socket's delayed transport close, which is unrelated to telemetry.
    session.live = null;
    await session.shutdown('hangup webhook');
    await drain();
  }
  const event = (type: string, item?: unknown) => session.onLive(JSON.stringify({ type: 'response.event', delegation_id: 'delegation_test', event: { type, ...(item ? { item } : {}) } }));
  const terminal = () => requests.filter((r) => r.path.endsWith('/events/track_partial') && r.body.is_pending === false);
  return { session, requests, start, queue, drain, shutdown, event, terminal };
}

test('unresolved monitoring initialization does not delay a tool or response completion', { timeout: 5000 }, async (t) => {
  const lookup = deferred<unknown>();
  const h = harness(t, { row: lookup.promise });
  await h.start();
  await h.event('response.output_item.done', { type: 'function_call', call_id: 'tool_one', name: 'test_tool', arguments: '{}' });
  assert.ok(h.session.live.sent.some((message: any) => message.item?.output === 'unknown tool test_tool'));
  await h.event('response.completed');
  assert.equal(h.session.backOfficeBusy, false);
  assert.equal(h.requests.length, 0);
  lookup.resolve({ account_id: 'test_account', direction: 'outbound' });
  await h.queue();
  await h.shutdown();
  assert.equal(h.terminal().filter((r) => r.body.event === 'callbay_back_office').length, 1);
});

test('a completed response waits for its pending tool and redacts payloads without putting them in span attributes', async (t) => {
  const h = harness(t);
  await h.start();
  await h.session.monitoringReady;
  const tool = deferred<void>();
  const payload = 'contact private@example.com at 415-555-0123, private-pin';
  h.session.askUser = async () => {
    await tool.promise;
    return payload;
  };
  const running = h.event('response.output_item.done', { type: 'function_call', call_id: 'tool_one', name: 'ask_user', arguments: JSON.stringify({ question: payload }) });
  await h.queue();
  await h.event('response.completed');
  await h.queue();
  assert.equal(h.session.backOfficeInteractions.get('delegation_test').activeTools, 1);
  assert.equal(h.terminal().length, 0, 'response completion must not finish a running tool');
  tool.resolve();
  await running;
  await h.queue();
  await h.drain();
  const event = h.terminal().find((r) => r.body.event === 'callbay_back_office')!.body;
  assert.equal(event.user_id, 'test_account');
  assert.equal(event.ai_data.convo_id, 'test_call');
  assert.equal(event.properties.status, 'response.completed');
  assert.match(event.ai_data.output, /REDACTED EMAIL/);
  assert.match(event.ai_data.output, /REDACTED PHONE NUMBER/);
  assert.doesNotMatch(event.ai_data.output, /private@example\.com|415-555-0123|private-pin/);
  const traceBodies = h.requests.filter((r) => r.path.endsWith('/traces')).map((r) => JSON.stringify(r.body)).join('\n');
  assert.match(traceBodies, /ask_user/);
  assert.doesNotMatch(traceBodies, /private@example\.com|415-555-0123|private-pin|traceloop\.entity\.(input|output)/);
  await h.shutdown();
});

test('shutdown delivers interruption once and ignores a tool that finishes after client close', async (t) => {
  const h = harness(t);
  await h.start();
  await h.session.monitoringReady;
  const tool = deferred<void>();
  h.session.askUser = async () => { await tool.promise; return 'late answer'; };
  const running = h.event('response.output_item.done', { type: 'function_call', call_id: 'tool_one', name: 'ask_user', arguments: '{}' });
  await h.queue();
  const monitoring = h.session.backOfficeInteractions.get('delegation_test');
  assert.equal(monitoring.activeTools, 1);
  await h.shutdown();
  const count = h.requests.length;
  assert.equal(h.terminal().find((r) => r.body.event === 'callbay_back_office')!.body.properties.status, 'interrupted');
  assert.equal(h.terminal().filter((r) => r.body.event === 'callbay_voice_call').length, 1);
  tool.resolve();
  await running;
  await h.queue();
  await h.drain();
  assert.equal(h.requests.length, count, 'late tool completion must not emit after close');
  assert.equal(monitoring.activeTools, 0);
  assert.equal(h.session.toolMonitoring.size, 0);
  assert.equal(h.session.backOfficeInteractions.size, 0);
});

test('calls without a write key keep tools working and send no monitoring traffic', async (t) => {
  const h = harness(t, { key: false });
  await h.start();
  await h.event('response.output_item.done', { type: 'function_call', call_id: 'tool_one', name: 'test_tool', arguments: '{}' });
  assert.ok(h.session.live.sent.some((message: any) => message.item?.output === 'unknown tool test_tool'));
  await h.event('response.completed');
  await h.shutdown();
  assert.equal(h.session.raindrop, null);
  assert.equal(h.requests.length, 0);
});
