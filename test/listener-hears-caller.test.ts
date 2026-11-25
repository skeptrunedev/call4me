import assert from 'node:assert/strict';
import test from 'node:test';
import { telnyx } from '../src/server/lib/telnyx';

// Alex listened in (Nov 23) and heard the business answer a caller he couldn't hear: the caller's
// audio went to Telnyx's default "opposite" leg, the business, and never to the supervisor leg his
// phone was on. Every stream we start sends it to both legs. Measured on staging with
// npm run staging:connect-test -- --listen ("the person heard our caller").
test('every call streams the caller to both legs, so a person listening in hears it', async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')));
    return Response.json({ data: { call_control_id: 'v3:control' } });
  });
  const api = telnyx({ TELNYX_API_KEY: 'key', TELNYX_CONNECTION_ID: 'conn' } as Env);
  await api.dial({ to: '+14155550123', from: '+14155550100', webhookUrl: 'https://call4.me/hook', streamUrl: 'wss://voice/stream', callId: 'call_1', timeLimitSecs: 600 });
  await api.answer('v3:control', { webhookUrl: 'https://call4.me/hook', streamUrl: 'wss://voice/stream', callId: 'call_2', timeLimitSecs: 600, record: true });
  await api.startStreaming('v3:control', 'wss://voice/stream');
  assert.equal(bodies.length, 3);
  for (const body of bodies) {
    assert.equal(body.stream_bidirectional_target_legs, 'both');
    assert.equal(body.stream_bidirectional_mode, 'rtp');
  }
});
