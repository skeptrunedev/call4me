import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { forcedHandoffMessage, MenuRecovery } from '../src/server/voice/handoff';

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
  sent: any[] = [];
  send(value: string) { this.sent.push(JSON.parse(value)); }
}
Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });

function harness(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
  // Match the existing session tests: exercise real provider message handling, no live calls.
  const session = new CallSession({ storage: {} } as any, { TELNYX_API_KEY: 'test-key' } as any) as any;
  session.setup = { callId: 'menu_test', controlId: 'test-control', redact: [] };
  session.live = new Socket();
  session.phone = new Socket();
  session.flushTimer = 1; // Transcript persistence is tested elsewhere.
  const input = (delta: string) => session.onLive(JSON.stringify({ type: 'session.input_transcript.delta', delta }));
  const response = (type: string, item?: unknown) => session.onLive(JSON.stringify({ type: 'response.event', delegation_id: 'test-delegation', event: { type, ...(item ? { item } : {}) } }));
  const forced = () => session.live.sent.filter((message: any) => message.item?.role === 'user');
  const keypress = (digits: string) => session.runTool({ call_id: 'test-keypress', name: 'press_digits', arguments: JSON.stringify({ digits }) });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'https://api.telnyx.com', 'never call a real business or model');
    assert.equal(url.pathname, '/v2/calls/test-control/actions/send_dtmf');
    return Response.json({ data: {} });
  });
  return { session, input, response, forced, keypress };
}

test('a repeated menu on the same transcript line is a fresh recovery opportunity', async (t) => {
  const h = harness(t);
  await h.input('For returns press one. For all other questions press five.');
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 1);
  await h.keypress('1');
  await h.response('response.completed');
  await h.input(' For an immediate refund, please return your order to any warehouse.');
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 2);
  assert.equal(h.session.transcript.length, 1, 'provider deltas still merge into the original transcript line');
  const recovery = h.forced()[1].item.content[0].text;
  assert.match(recovery, /recorded instructions/);
  assert.match(recovery, /Keypad submitted: 1/);
  assert.match(recovery, /For all other questions press five/);
  assert.doesNotMatch(recovery, /nothing was pressed/);
  await h.response('response.completed');
  t.mock.timers.tick(10_000);
  assert.equal(h.forced().length, 2, 'unchanged input is not retried endlessly');
  await h.input(' No input was received.');
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 3);
});

test('normal delegation without a keypress does not mark the menu handled', async (t) => {
  const h = harness(t);
  await h.input('For scheduling press one.');
  await h.session.onLive(JSON.stringify({ type: 'session.delegation.created', delegation: { id: 'normal', target: 'responses' } }));
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 0);
  await h.response('response.completed');
  t.mock.timers.tick(0);
  assert.equal(h.forced().length, 1);
});

test('quiet menus resume after a pending tool finishes', async (t) => {
  const h = harness(t);
  let resolve!: (answer: string) => void;
  h.session.askUser = () => new Promise<string>((done) => { resolve = done; });
  const running = h.response('response.output_item.done', { type: 'function_call', call_id: 'question', name: 'ask_user', arguments: '{"question":"What is the code?"}' });
  await Promise.resolve();
  await h.input('Please enter your account number.');
  await h.response('response.completed');
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 0);
  resolve('1234');
  await running;
  t.mock.timers.tick(0);
  assert.equal(h.forced().length, 0, 'the tool continuation must complete before starting recovery');
  assert.equal(h.session.backOfficeBusy, true);
  await h.response('response.completed');
  t.mock.timers.tick(0);
  assert.equal(h.forced().length, 1);
});

test('continuing menu audio extends the quiet deadline', async (t) => {
  const h = harness(t);
  await h.input('For returns press one.');
  t.mock.timers.tick(2_000);
  await h.input(' For a representative press five.');
  t.mock.timers.tick(2_999);
  assert.equal(h.forced().length, 0);
  t.mock.timers.tick(1);
  assert.equal(h.forced().length, 1);
  assert.match(h.forced()[0].item.content[0].text, /representative press five/);
});

test('hold and a person answering suppress historical menu options', async (t) => {
  const h = harness(t);
  await h.input('For returns press one. Please hold while your call is being transferred.');
  t.mock.timers.tick(10_000);
  assert.equal(h.forced().length, 0);
  await h.input(' My name is Dan. How can I help you?');
  t.mock.timers.tick(10_000);
  assert.equal(h.forced().length, 0);
});

test('ended calls and calls with a person leg never force menu actions', async (t) => {
  const h = harness(t);
  await h.input('For returns press one.');
  h.session.personLeg = 'person-leg';
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 0);
  h.session.personLeg = null;
  h.session.ended = true;
  h.session.scheduleHandoffCheck();
  t.mock.timers.tick(10_000);
  assert.equal(h.forced().length, 0);
});

test('failed or unavailable DTMF is never reported as submitted', async (t) => {
  const h = harness(t);
  await h.input('For returns press one.');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ errors: [{ detail: 'test failure' }] }, { status: 500 }));
  await assert.rejects(h.keypress('1'));
  assert.match(h.session.menuRecovery.history(), /no keypad input has been submitted/);
  assert.ok(h.session.menuRecovery.pending());
  delete h.session.setup.controlId;
  await h.keypress('1');
  assert.match(h.session.live.sent.at(-2).item.output, /was not submitted/);
  assert.match(h.session.menuRecovery.history(), /no keypad input has been submitted/);
});

test('new input arriving during keypad submission is preserved', async (t) => {
  const h = harness(t);
  await h.input('For returns press one.');
  let resolve!: (value: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((done) => { resolve = done; }));
  const running = h.keypress('1');
  await Promise.resolve();
  await h.input(' No input was received.');
  resolve(Response.json({ data: {} }));
  await running;
  assert.equal(h.session.menuRecovery.pending()?.reason, 'menu_recovery');
});

test('failure phrases require menu context and French options are recognized', () => {
  const recovery = new MenuRecovery();
  recovery.observe('No response was received.', 1);
  assert.equal(recovery.pending(), null);
  recovery.checked(recovery.snapshot());
  recovery.observe('Pour le service en français, appuyez sur le 1.', 2);
  assert.equal(recovery.pending()?.reason, 'menu');
  recovery.submitted('1', recovery.snapshot());
  recovery.observe('Pour la production, composez le deux.', 3);
  assert.equal(recovery.pending()?.reason, 'menu');
  recovery.submitted('2', recovery.snapshot());
  recovery.observe("I don't recognize that entry.", 4);
  const miss = recovery.pending()!;
  assert.equal(miss.reason, 'menu_recovery');
  assert.match(forcedHandoffMessage(miss, [], recovery.history()), /Never assume 0/);
});

test('website instructions from a live person are not keypad prompts', () => {
  const recovery = new MenuRecovery();
  recovery.observe('For returns press one.', 1);
  recovery.submitted('1', recovery.snapshot());
  recovery.observe('Thank you for holding. My name is Jane.', 2);
  recovery.observe(' Please enter your order number on our website.', 3);
  assert.equal(recovery.pending(), null);
  recovery.observe(' Please visit our website.', 4);
  assert.equal(recovery.pending(), null);
  recovery.observe(' Use your phone keypad to enter the extension followed by pound.', 5);
  assert.equal(recovery.pending()?.reason, 'menu', 'an explicit phone keypad request can still be delegated');
});

test('a late keypad acceptance cannot reopen a menu after a person answers', () => {
  const recovery = new MenuRecovery();
  recovery.observe('For returns press one.', 1);
  const pendingKeypad = recovery.snapshot();
  recovery.observe(' My name is Jane. How can I help you?', 2);
  recovery.submitted('1', pendingKeypad);
  recovery.observe(' Please visit our website.', 3);
  assert.equal(recovery.pending(), null);
  assert.match(recovery.history(), /Keypad submitted: 1/);
});
