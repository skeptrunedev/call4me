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
  t.mock.method(console, 'warn', () => {});
  const session = new VoiceSession({ storage, waitUntil() {} } as any, { DB: d1(), OPENAI_API_KEY: 'k' } as any) as any;
  session.setup = { callId: 'dead_stream_test', instructions: 'Test', backOffice: 'Tools', voice: 'marin', maxSeconds: 1200, redact: [] };
  session.answered = true;
  session.answeredAt = Date.now();
  session.transcriptComplete = true;
  session.live = new Socket();
  session.liveReady = true;
  const phone = new Socket();
  session.attachPhone(phone);
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
