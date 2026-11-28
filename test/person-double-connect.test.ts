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

/**
 * call_aga5g9avx2q0l0lm (United, Nov 27): the back office rang the owner while her own agent called
 * call4me_connect_me in the same moment. Two legs rang her phone 21ms apart, one of them hung up,
 * and the session took that for her leaving while she was still on the other: the caller talked
 * over her and answered her as if she were the agent.
 *
 * Reproduced on staging with npm run staging:connect-test -- --twice before the fix. Here, a voice
 * session with a live call and a person to ring, whose Telnyx requests are held until the test lets
 * them through, as Telnyx takes about half a second to place a leg.
 */
function session(t: TestContext) {
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => { values.set(key, value); },
    delete: async () => {},
    deleteAll: async () => {},
    setAlarm: async () => {},
    deleteAlarm: async () => {},
  };
  const env = { DB: d1(), OPENAI_API_KEY: 'test-key', TELNYX_API_KEY: 'test-telnyx', TELNYX_CONNECTION_ID: 'conn' } as any;
  const s = new VoiceSession({ storage, waitUntil() {} } as any, env) as any;
  s.setup = {
    callId: 'call_double', controlId: 'business-leg', instructions: 'Test instructions', backOffice: 'Test tools', voice: 'marin', maxSeconds: 1200, redact: [],
    person: { name: 'Maz', phone: '+17075550100', from: '+16165550100', webhookUrl: 'https://call4.me/webhooks/telnyx' },
  };
  s.answered = true;
  s.answeredAt = Date.now();
  s.sendLive = (message: unknown) => { told.push(JSON.stringify(message)); };
  const told: string[] = [];
  const dials: { resolve: () => void }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/v2/calls') && init?.method === 'POST') {
      const leg = `person-leg-${dials.length + 1}`;
      return new Promise<Response>((resolve) => dials.push({ resolve: () => resolve(Response.json({ data: { call_control_id: leg } })) }));
    }
    return Response.json({ data: {} });
  });
  const post = (path: string, body: unknown = {}) => s.fetch(new Request(`https://session${path}`, { method: 'POST', body: JSON.stringify(body) }));
  return { s, dials, told, post };
}

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('two requests to ring the person at the same moment ring their phone once', async (t) => {
  const { dials, post } = session(t);
  const first = post('/connect-person', { mode: 'join' });
  const second = post('/connect-person', { mode: 'join' });
  await settle();
  for (const d of dials) d.resolve();
  const messages = await Promise.all([first, second].map(async (r) => ((await (await r).json()) as { message: string }).message));
  assert.equal(dials.length, 1, `rang the person ${dials.length} times: ${JSON.stringify(messages)}`);
});

test("a leg that isn't theirs hanging up leaves them on the call and the caller quiet; their own hanging up hands it back", async (t) => {
  const { s, dials, told, post } = session(t);
  const ring = post('/connect-person', { mode: 'join' });
  await settle();
  for (const d of dials) d.resolve();
  await ring;
  const theirs: string = s.personLeg;
  await post('/person-answered', { leg: 'person-leg-stray' });
  assert.equal(s.personOn, false, "another leg answering doesn't put them on the call");
  await post('/person-answered', { leg: theirs });
  assert.equal(s.personOn, true, 'their leg answered: they are on the call');

  told.length = 0;
  await post('/person-key', { digit: '5', leg: 'person-leg-stray' });
  await post('/person-left', { leg: 'person-leg-stray', sip: '200' });
  assert.equal(s.personOn, true, 'still on the call: the leg that hung up was not theirs');
  assert.ok(!told.some((m) => /left the call|couldn't be reached/.test(m)), `the caller was told: ${told.join(' | ')}`);

  await post('/person-left', { leg: theirs, sip: '200' });
  assert.equal(s.personOn, false);
  assert.ok(told.some((m) => /has left the call and handed it back to you/.test(m)), 'their own hang-up hands the call back');
});

test('an event that names no leg is taken as theirs, as the site sent before legs were named', async (t) => {
  const { s, dials, post } = session(t);
  const ring = post('/connect-person', { mode: 'join' });
  await settle();
  for (const d of dials) d.resolve();
  await ring;
  await post('/person-answered');
  assert.equal(s.personOn, true);
  await post('/person-left', { sip: '200' });
  assert.equal(s.personOn, false);
});
