import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { MenuRecovery } from '../src/server/voice/handoff';

const workerModule = `export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent(workerModule)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { VoiceSession } = await import('../src/server/voice/session');

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
  const session = new VoiceSession({ storage: {} } as any, { TELNYX_API_KEY: 'test-key' } as any) as any;
  session.setup = { callId: 'menu_test', controlId: 'test-control', redact: [] };
  session.live = new Socket();
  session.phone = new Socket();
  session.flushTimer = 1; // Transcript persistence is tested elsewhere.
  const input = (delta: string) => session.onLive(JSON.stringify({ type: 'session.input_transcript.delta', delta }));
  const output = (delta: string) => session.onLive(JSON.stringify({ type: 'session.output_transcript.delta', delta }));
  const response = (type: string, item?: unknown) => session.onLive(JSON.stringify({ type: 'response.event', delegation_id: 'test-delegation', event: { type, ...(item ? { item } : {}) } }));
  const forced = () => session.live.sent.filter((message: any) => message.item?.role === 'user');
  const keypress = (digits: string) => session.runTool({ call_id: 'test-keypress', name: 'press_digits', arguments: JSON.stringify({ digits }) });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'https://api.telnyx.com', 'never call a real business or model');
    assert.equal(url.pathname, '/v2/calls/test-control/actions/send_dtmf');
    return Response.json({ data: {} });
  });
  return { session, input, output, response, forced, keypress };
}

const echoMenu = 'You are now entering the DTMF echo test. Press any key on your keypad and you will hear it played back. Press the star key to hear this menu again. Press the hash key to end the call.';

test('a spoken next keypad action after confirmed keys gets a real delegation', async (t) => {
  const h = harness(t);
  await h.input(echoMenu);
  await h.output('Pressing five now.');
  await h.keypress('5');
  await h.response('response.completed');
  t.mock.timers.tick(1_000);
  await h.input(' You pressed five.');
  await h.output('Okay. Got that. Now, two. Waiting for the line to confirm.');
  await h.keypress('2');
  await h.response('response.completed');
  t.mock.timers.tick(1_000);
  await h.input(' You pressed two.');
  await h.output('Nice. Now star to hear the menu again.');
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 1, 'speaking about star is not the same as pressing it');
  const request = h.forced()[0].item.content[0].text;
  assert.match(request, /Now star/);
  assert.match(request, /Press the star key/);
  assert.match(request, /Keypad submitted: 5/);
  assert.match(request, /Keypad submitted: 2/);
  await h.keypress('*');
  await h.response('response.completed');
  t.mock.timers.tick(10_000);
  assert.equal(h.forced().length, 1, 'accepted star does not get submitted twice');
});

test('keypad prompts with articles and arbitrary keys are recognized without caller speech', () => {
  for (const text of [echoMenu, 'Press any key to continue.', 'Press the pound key to finish.']) {
    const recovery = new MenuRecovery();
    recovery.observe(text, 1);
    assert.equal(recovery.pending()?.reason, 'menu', text);
  }
});

test('no input detected after a submitted key creates a fresh recovery opportunity', () => {
  const recovery = new MenuRecovery();
  recovery.observe(echoMenu, 1);
  recovery.submitted('5', recovery.snapshot());
  recovery.observe(' No input detected.', 2);
  assert.equal(recovery.pending()?.reason, 'menu_recovery');
});

for (const action of ['Now, two.', 'Pressing the star key.', "I'll dial pound.", 'Next, 3.', '2.']) {
  test(`fresh keypad commitment is recognized in active menu context: ${action}`, () => {
    const recovery = new MenuRecovery();
    recovery.observe(echoMenu, 1);
    recovery.submitted('5', recovery.snapshot());
    recovery.observe(' You pressed five.', 2);
    recovery.observeCaller(action, 3);
    assert.equal(recovery.pending()?.reason, 'keypad');
  });
}

test('late acceptance of one key preserves a newer different commitment', async (t) => {
  const h = harness(t);
  await h.input(echoMenu);
  await h.output('Pressing five.');
  let resolve!: (value: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((done) => { resolve = done; }));
  const running = h.keypress('5');
  await Promise.resolve();
  await h.input(' You pressed five.');
  await h.output('Now two.');
  resolve(Response.json({ data: {} }));
  await running;
  await h.response('response.completed');
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 1);
  assert.match(h.forced()[0].item.content[0].text, /Now two/);
});

test('accepted keys and acknowledgments cannot reopen their own keypad action', () => {
  const recovery = new MenuRecovery();
  recovery.observe(echoMenu, 1);
  recovery.observeCaller('Pressing five.', 2);
  const submitted = recovery.snapshot();
  recovery.observeCaller(' Now five.', 3);
  recovery.submitted('5', submitted);
  assert.equal(recovery.pending(), null, 'same key spoken while submission was pending is consumed');
  recovery.observeCaller(' Pressing five.', 4);
  assert.equal(recovery.pending(), null, 'same key spoken after acceptance is not replayed before new input');
  recovery.submitted('5', recovery.snapshot());
  recovery.observe(' You pressed five.', 5);
  recovery.observeCaller('Got five. Nice. Hmm.', 6);
  assert.equal(recovery.pending(), null, 'acknowledging the returned digit is not an action');
});

test('a human greeting without provider punctuation closes the previous menu context', () => {
  const recovery = new MenuRecovery();
  recovery.observe('For support press one', 1);
  recovery.observeCaller('Pressing one', 2);
  recovery.submitted('1', recovery.snapshot());
  recovery.observe('Hello, this is Jane speaking', 3);
  recovery.observeCaller('Now star to hear the menu again', 4);
  assert.equal(recovery.pending(), null);
});

for (const response of ['Hello, this is Jane speaking.', 'Please hold while I check.', 'Please remain on the line.']) {
  test(`old keypad context cannot trigger spoken key recovery after ${response}`, async (t) => {
    const h = harness(t);
    await h.input('For support press one. Press star to repeat the menu.');
    await h.keypress('1');
    await h.response('response.completed');
    await h.input(` ${response}`);
    await h.output('Now star to hear the menu again.');
    t.mock.timers.tick(10_000);
    assert.equal(h.forced().length, 0);
  });
}

test('a repeated menu on the same transcript line is a fresh recovery opportunity', async (t) => {
  const h = harness(t);
  await h.input('For returns press one.');
  t.mock.timers.tick(2_000);
  await h.input(' For all other questions press five.');
  t.mock.timers.tick(2_999);
  assert.equal(h.forced().length, 0, 'continuing audio extends the quiet deadline');
  t.mock.timers.tick(1);
  assert.equal(h.forced().length, 1);
  assert.match(h.forced()[0].item.content[0].text, /For all other questions press five/);
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

test('hold and a person answering suppress historical menu options', async (t) => {
  const h = harness(t);
  await h.input('For returns press one. Please hold while your call is being transferred.');
  t.mock.timers.tick(10_000);
  assert.equal(h.forced().length, 0);
  await h.input(' My name is Dan. How can I help you?');
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

test('cardholder menu rejection delegates again after caller filler and an accepted keypad request', async (t) => {
  const h = harness(t);
  const prompt = 'If you have your card handy, please press one. If you do not have your card handy, please press two.';
  await h.input(prompt);
  await h.session.onLive(JSON.stringify({ type: 'session.output_transcript.delta', delta: 'Hmm.' }));
  t.mock.timers.tick(3_000);
  assert.equal(h.forced().length, 1);
  await h.keypress('2');
  await h.response('response.completed');

  for (let attempt = 0; attempt < 2; attempt++) {
    await h.input(` I am sorry, we did not understand your input, please try again. ${prompt}`);
    await h.session.onLive(JSON.stringify({ type: 'session.output_transcript.delta', delta: 'Hmm.' }));
    t.mock.timers.tick(3_000);
    assert.equal(h.forced().length, attempt + 2, 'each fresh rejection gets a recovery handoff');
    const recovery = h.forced().at(-1).item.content[0].text;
    assert.match(recovery, /we did not understand your input/);
    assert.match(recovery, /Keypad submitted: 2/);
    await h.keypress('2');
    await h.response('response.completed');
  }
});

test('caller filler cannot postpone a finished menu beyond its keypad deadline', async (t) => {
  const h = harness(t);
  await h.input('If you have your card handy, please press one. If you do not have your card handy, please press two.');
  t.mock.timers.tick(2_000);
  await h.session.onLive(JSON.stringify({ type: 'session.output_transcript.delta', delta: 'Hmm.' }));
  t.mock.timers.tick(1_000);
  assert.equal(h.forced().length, 1, 'the deadline belongs to the finished menu, even if the caller speaks');
  await h.response('response.completed');
  for (let i = 0; i < 3; i++) {
    await h.session.onLive(JSON.stringify({ type: 'session.output_transcript.delta', delta: ' Hmm.' }));
    t.mock.timers.tick(3_000);
  }
  assert.equal(h.forced().length, 1, 'caller filler never reopens a menu already delegated');
});

test('a late keypad acceptance cannot reopen a menu after a person answers', () => {
  const recovery = new MenuRecovery();
  recovery.observe('For returns press one.', 1);
  const pendingKeypad = recovery.snapshot();
  recovery.observe(' My name is Jane. How can I help you?', 2);
  recovery.submitted('1', pendingKeypad);
  recovery.observe(' Please enter your order number on our website.', 3);
  assert.equal(recovery.pending(), null);
  recovery.observe(' Please visit our website.', 4);
  assert.equal(recovery.pending(), null);
  assert.match(recovery.history(), /Keypad submitted: 1/);
  recovery.observe(' Use your phone keypad to enter the extension followed by pound.', 5);
  assert.equal(recovery.pending()?.reason, 'menu', 'an explicit phone keypad request can still be delegated');
});
