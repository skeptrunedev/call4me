import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { readClientState, telnyx } from '../src/server/lib/telnyx';
import type { TranscriptLine } from '../src/server/services/calls';
import { alreadyUnreachable, mergeTranscript, unreachableMessage } from '../src/server/voice/person';

const env = { TELNYX_API_KEY: 'test_api_key', TELNYX_CONNECTION_ID: 'test_connection' } as Env;

function captureTelnyx(t: TestContext): { method: string; path: string; body: Record<string, unknown> }[] {
  const sent: { method: string; path: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    sent.push({ method: String(init.method), path: new URL(url).pathname, body: JSON.parse(String(init.body ?? '{}')) as Record<string, unknown> });
    return new Response(JSON.stringify({ data: { call_control_id: 'v3:person' } }), { status: 200 });
  });
  return sent;
}

test('the person is rung listen-only, so a voicemail picking up is never heard on the call', async (t) => {
  const sent = captureTelnyx(t);
  const leg = await telnyx(env).dialPerson({ to: '+19255550100', from: '+17755550100', webhookUrl: 'https://call4.me/webhooks/telnyx', callId: 'call_x', superviseControlId: 'v3:business', timeLimitSecs: 600 });
  assert.equal(leg, 'v3:person');
  assert.equal(sent[0].path, '/v2/calls');
  assert.equal(sent[0].body.supervisor_role, 'monitor');
  assert.equal(sent[0].body.supervise_call_control_id, 'v3:business');
  assert.deepEqual(readClientState(String(sent[0].body.client_state)), { callId: 'call_x', personLeg: true });
});

test('pressing 1 switches the person to barge', async (t) => {
  const sent = captureTelnyx(t);
  await telnyx(env).switchSupervisorRole('v3:person', 'barge');
  assert.deepEqual(sent[0], { method: 'POST', path: '/v2/calls/v3%3Aperson/actions/switch_supervisor_role', body: { role: 'barge' } });
});

test('an unreachable person is not rung again by the caller', () => {
  assert.match(unreachableMessage('Kristoph'), /Don't try to connect them again/);
  assert.match(alreadyUnreachable('Kristoph'), /don't ring again/);
});

test('a session restarted mid-call keeps the stored transcript and adds its own lines after it', () => {
  const stored: TranscriptLine[] = [
    { role: 'them', text: 'Thanks for calling Xfinity.', at: 1 },
    { role: 'caller', text: "Hi, I'm calling to cancel.", at: 2 },
  ];
  const restarted: TranscriptLine[] = [{ role: 'note', text: "Kristoph didn't join (no answer or voicemail)", at: 3 }];
  assert.deepEqual(mergeTranscript(stored, restarted), [...stored, ...restarted]);
  assert.deepEqual(mergeTranscript([], restarted), restarted);
  // Lines the stored copy already has are not duplicated.
  assert.deepEqual(mergeTranscript(stored, [stored[1], ...restarted]), [...stored, ...restarted]);
});
