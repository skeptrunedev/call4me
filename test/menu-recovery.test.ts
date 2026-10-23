import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { dtmfFrames } from '../src/server/voice/dtmf';

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

test('old keypad context cannot trigger spoken key recovery after a person answers', async (t) => {
  const h = harness(t);
  await h.input('For support press one. Press star to repeat the menu.');
  await h.keypress('1');
  await h.response('response.completed');
  await h.input(' Hello, this is Jane speaking.');
  await h.output('Now star to hear the menu again.');
  t.mock.timers.tick(10_000);
  assert.equal(h.forced().length, 0);
});

test('a repeated menu on the same transcript line is a fresh recovery opportunity', async (t) => {
  const h = harness(t);
  h.session.answered = true;
  const tone = JSON.stringify({ event: 'media', media: { payload: dtmfFrames('4')[0] } });
  await h.input('For returns press one.');
  t.mock.timers.tick(500);
  await h.input(' For all other questions press five.');
  t.mock.timers.tick(500);
  h.session.onPhoneFrame(tone);
  t.mock.timers.tick(699);
  assert.equal(h.forced().length, 0, 'the recording still playing extends the quiet deadline');
  t.mock.timers.tick(1);
  assert.equal(h.forced().length, 1, 'a pause in the recording gets its keypad choice at once');
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

test('music under a menu cannot hold its keypad choice past the transcript deadline', async (t) => {
  const h = harness(t);
  h.session.answered = true;
  const tone = JSON.stringify({ event: 'media', media: { payload: dtmfFrames('4')[0] } });
  await h.input('For returns press one.');
  for (let ms = 0; ms < 2_900; ms += 100) {
    h.session.onPhoneFrame(tone);
    t.mock.timers.tick(100);
  }
  assert.equal(h.forced().length, 0);
  h.session.onPhoneFrame(tone);
  t.mock.timers.tick(100);
  assert.equal(h.forced().length, 1);
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


test('the same key twice with nothing heard in between goes in once', async (t) => {
  const h = harness(t);
  const presses = () => (globalThis.fetch as any).mock.calls.length;
  await h.input('This is a collect call from an inmate at Toronto South Detention Centre. To accept this call, press 1.');
  await h.keypress('1');
  await h.keypress('1');
  assert.equal(presses(), 1);
  await h.input(' To accept this call, press 1.');
  await h.keypress('1');
  assert.equal(presses(), 2);
});

test('an answered call sends the key to the network once and beeps so the caller hears it', async (t) => {
  const h = harness(t);
  h.session.setup.keyBeep = true;
  await h.input('This is a collect call from an inmate at Toronto South Detention Centre. To accept this call, press 1.');
  await h.keypress('1');
  assert.equal((globalThis.fetch as any).mock.calls.length, 1);
  assert.ok(h.session.phone.sent.filter((m: any) => m.event === 'media').length > 0);
});

// Liberty Mutual (call_nykj75fzteglkx3d): its menu takes keys or speech, and the caller's "Mmh."
// at the end of the options was rejected as a spoken answer before the back office's 3 arrived.
const libertyMenu = 'Please say existing policy, or press one. Claims, or press two. Sales, or press three.';

test('the caller makes no sound on a keypad menu until its key is chosen', async (t) => {
  const h = harness(t);
  const speak = () => h.session.onLive(JSON.stringify({ type: 'session.output_audio.delta', delta: dtmfFrames('5')[0] }));
  const heard = () => h.session.phone.sent.filter((m: any) => m.event === 'media').length;
  await h.input(libertyMenu);
  await speak();
  await h.output('Mmh.');
  assert.equal(heard(), 0, 'filler while the options play never reaches the menu');
  t.mock.timers.tick(1_000);
  assert.equal(h.forced().length, 1);
  await speak();
  assert.equal(heard(), 0, 'nor while the back office picks the key');
  await h.keypress('3');
  await h.response('response.completed');
  await speak();
  await h.output('Hmm.');
  assert.equal(heard(), 0, 'nor right after the key, before the menu answers it');
  assert.ok(!h.session.transcript.some((l: any) => l.role === 'caller'), 'what never played is not in the transcript');
  t.mock.timers.tick(1_000);
  await h.input(' Hello, my name is Dana, how can I help?');
  await speak();
  assert.equal(heard(), 1, 'the caller speaks again once a person answers');
});

// Telnyx's screening detection fires on menu and voicemail greetings too (call_lzc1mh8jaxa5rwhr: the
// caller's "Hi!" over "monitored and recorded" was a wrong spoken answer). Only a screener's ask gets an introduction.
const screener = "Hi, if you record your name and reason for calling, I'll see if this person is available.";
for (const [heardFirst, introduces] of [
  ['Thank you for calling Liberty Mutual Insurance. This call may be monitored and recorded.', false],
  [screener, true],
] as const) {
  test(`call screening detection after "${heardFirst.slice(0, 40)}" ${introduces ? 'asks for an introduction' : 'is held'}`, async (t) => {
    const h = harness(t);
    const stored = new Map<string, unknown>();
    h.session.ctx.storage = { get: async (k: string) => stored.get(k), put: async (k: string, v: unknown) => void stored.set(k, v) };
    h.session.liveReady = true;
    await h.input(heardFirst);
    await h.session.machineDetected('screening_prompt_ended');
    const guidance = h.session.live.sent.filter((m: any) => m.type === 'session.commentary.append');
    assert.equal(guidance.length, introduces ? 1 : 0);
  });
}

test('screening detection before the words introduces once a screener asks', async (t) => {
  const h = harness(t);
  const stored = new Map<string, unknown>();
  h.session.ctx.storage = { get: async (k: string) => stored.get(k), put: async (k: string, v: unknown) => void stored.set(k, v) };
  h.session.liveReady = true;
  await h.session.machineDetected('screening_prompt_ended');
  const guidance = () => h.session.live.sent.filter((m: any) => m.type === 'session.commentary.append');
  assert.equal(guidance().length, 0);
  await h.input(screener);
  await h.session.machineUpdates;
  assert.equal(guidance().length, 1);
  assert.match(guidance()[0].content, /call screener is ready/);
});

// Liberty Mutual (call_11ctp62kjbc9rb3k): the voice model's "Hmm." a second after each 3 was taken as the answer.
test('a menu that never answers the key releases the caller after the hold', async (t) => {
  const h = harness(t);
  const speak = () => h.session.onLive(JSON.stringify({ type: 'session.output_audio.delta', delta: dtmfFrames('5')[0] }));
  const heard = () => h.session.phone.sent.filter((m: any) => m.event === 'media').length;
  await h.input(libertyMenu);
  t.mock.timers.tick(1_000);
  await h.keypress('3');
  await h.response('response.completed');
  t.mock.timers.tick(7_000);
  await speak();
  assert.equal(heard(), 0, 'held while the menu may still be acting on the key');
  t.mock.timers.tick(1_500);
  await speak();
  assert.equal(heard(), 1, 'never held for good when nothing answers');
});

