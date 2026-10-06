import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { callInstructions } from '../src/server/voice/prompt';

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

class Socket {
  static OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  send(value: string) { this.sent.push(JSON.parse(value)); }
}
Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });

for (const reply of [
  ['What name is the order under?'],
  ["I'm checking your previous order. Give me two", 'minutes.'],
  ['Can I put you on a quick hold?', 'Yeah.'],
]) {
  test(`quiet after ${reply.join(' ')} does not prompt speech or end the call`, async (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('No external requests are expected'); });
    const session = new VoiceSession({ storage: {} } as any, {} as any) as any;
    session.setup = { callId: 'silence_test', redact: [] };
    session.live = new Socket();
    session.phone = new Socket();
    session.flushTimer = 1;
    const transcript = (side: 'input' | 'output', delta: string) => session.onLive(JSON.stringify({ type: `session.${side}_transcript.delta`, delta }));
    await transcript('output', 'Could you look up my previous order?');
    for (const fragment of reply) {
      await transcript('input', fragment);
      t.mock.timers.tick(100);
    }
    await transcript('output', 'Sure, no problem.');
    t.mock.timers.tick(180_000);
    assert.deepEqual(session.live.sent, [], 'silence must not inject commentary or start backend work');
    assert.deepEqual(session.phone.sent, []);
    assert.equal(session.ended, false, 'waiting must not terminate the phone call');
    await transcript('input', 'Thanks for waiting. I found it.');
    assert.equal(session.transcript.at(-1).text, 'Thanks for waiting. I found it.');
  });
}

test('voice instructions require quiet waiting while the other person checks', () => {
  const instructions = callInstructions({
    owner: 'Alex', assistantName: null, callingAs: null, onBehalfOf: 'Alex',
    business: 'Test store', goal: 'Reorder dog food', facts: '', flexibility: '',
    callbackNumber: '+14155550100', callbackRingsOwner: false, localTime: null, connectWhen: null,
  });
  assert.match(instructions, /When a person goes quiet, wait for them to speak/);
  assert.match(instructions, /Never ask whether they're still there just because the line is quiet/);
  assert.match(instructions, /even if they speak in fragments or take a few minutes/);
});
