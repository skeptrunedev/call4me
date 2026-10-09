import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { calls } from '../src/server/services/calls';
import { backOfficeInstructions, callInstructions, type CallBrief } from '../src/server/voice/prompt';
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

class Socket {
  static OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  send(value: string) { this.sent.push(JSON.parse(value)); }
}
Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });

async function harness(t: TestContext, unattended = false) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No external requests are expected'); });
  const db = d1();
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at)
    VALUES ('question_test', 'acct_alice', '+14155550100', 'Test business', 'Look up a rebate', '{}', 'in_progress', 0)`).run();
  const session = new VoiceSession({ storage: {} } as any, { DB: db } as any) as any;
  session.setup = { callId: 'question_test', unattended, person: { name: 'Alice' } };
  session.live = new Socket();
  session.transcript = [{ role: 'them', text: 'What is the rebate amount?', at: Date.now() }];
  session.lastTranscriptAt = Date.now();
  const ask = (question = 'What is the rebate amount?') => session.askUser(session.setup, question) as Promise<string>;
  const questions = () => calls(db).questions(session.setup.callId);
  const pending = async () => {
    for (let i = 0; i < 20 && !session.waiting.size; i++) await Promise.resolve();
    assert.equal(session.waiting.size, 1);
    return (await questions()).at(-1)!;
  };
  return { session, ask, questions, pending };
}

test('an unattended question is saved without holding the recipient and a late answer still arrives', async (t) => {
  const h = await harness(t, true);
  const result = await h.ask();
  assert.match(result, /No answer is available/);
  assert.equal(h.session.waiting.size, 0);
  assert.equal(h.session.holding, null);
  const [question] = await h.questions();
  assert.equal(question.answer, null);
  const guidance = h.session.live.sent[0];
  assert.equal(guidance.type, 'session.commentary.append');
  assert.match(guidance.content, /Stop waiting/);
  assert.match(guidance.content, /Never guess facts/);
  assert.match(guidance.content, /look it up using facts already supplied/);
  t.mock.timers.tick(180_000);
  assert.equal(h.session.live.sent.length, 1, 'no scheduled checking loop');
  h.session.answerCameIn(question.id, question.question, 'The paperwork says $50');
  assert.equal(h.session.live.sent.at(-1).type, 'session.commentary.append');
  assert.match(h.session.live.sent.at(-1).content, /paperwork says \$50/);
});

test('a monitored answer arriving after a minute still resumes the pending question', async (t) => {
  const h = await harness(t);
  const result = h.ask('What code arrived?');
  const question = await h.pending();
  t.mock.timers.tick(65_000);
  assert.equal(h.session.live.sent.length, 1, 'only one checking acknowledgment');
  h.session.answerCameIn(question.id, question.question, '123456');
  assert.match(await result, /Answer: 123456/);
  assert.match(h.session.live.sent.at(-1).content, /123456/);
  assert.equal(h.session.waiting.size, 0);
  assert.equal(h.session.holdingTimer, null);
  t.mock.timers.tick(180_000);
  assert.equal(h.session.live.sent.length, 2, 'answered questions never time out afterwards');
});

test('an unanswered attended question directly releases the voice and subsequent questions do not wait again', async (t) => {
  const h = await harness(t);
  const result = h.ask();
  const question = await h.pending();
  t.mock.timers.tick(120_000);
  assert.match(await result, /No answer is available/);
  assert.equal(h.session.live.sent.length, 2, 'one acknowledgment, then the unavailable outcome');
  assert.match(h.session.live.sent.at(-1).content, /Stop waiting/);
  assert.equal(h.session.holdingTimer, null);
  assert.match(await h.ask('Do you know the date instead?'), /No answer is available/);
  assert.equal(h.session.waiting.size, 0);
  h.session.answerCameIn(question.id, question.question, '$50');
  const returned = h.ask('Can you approve a different date?');
  const newQuestion = await h.pending();
  h.session.answerCameIn(newQuestion.id, newQuestion.question, 'Yes');
  assert.match(await returned, /Answer: Yes/, 'a returned user can answer new questions normally');
});

test('a pending question never injects checking speech while the business has asked us to hold', async (t) => {
  const h = await harness(t);
  h.session.transcript[0].text = 'Please hold while I check your account.';
  const result = h.ask();
  const question = await h.pending();
  t.mock.timers.tick(65_000);
  assert.deepEqual(h.session.live.sent, []);
  h.session.answerCameIn(question.id, question.question, '$50');
  await result;
});

test('voice and back office honor known unknowns and unattended execution', () => {
  const brief: CallBrief = {
    owner: 'Alice', assistantName: null, callingAs: null, onBehalfOf: 'Alice',
    business: 'Test business', goal: 'Look up a rebate', facts: 'Exact amount unknown, possibly $50 or $100.', flexibility: '',
    callbackNumber: '+14155550100', callbackRingsOwner: false, localTime: null, connectWhen: null, unattended: true,
  };
  const voice = callInstructions(brief);
  assert.match(voice, /Never turn an estimate into a confirmed answer/);
  assert.match(voice, /Do not put the other person on hold for a user response/);
  assert.match(backOfficeInstructions(brief), /saves a question but does not wait/);
  assert.doesNotMatch(callInstructions({ ...brief, unattended: false }), /This is a scheduled call/);
});

test('ending a call resolves its pending questions without a timeout announcement', async (t) => {
  const h = await harness(t);
  h.session.ctx.storage.deleteAlarm = async () => {};
  h.session.ctx.waitUntil = () => {};
  t.mock.method(h.session, 'flushTranscript', async () => {});
  h.session.live.close = () => {};
  const result = h.ask();
  await h.pending();
  await h.session.shutdown('test ended');
  assert.equal(await result, 'the call has ended');
  assert.equal(h.session.waiting.size, 0);
  assert.equal(h.session.holdingTimer, null);
  assert.deepEqual(h.session.live.sent, [{ type: 'session.close' }]);
  t.mock.timers.tick(180_000);
  assert.deepEqual(h.session.live.sent, [{ type: 'session.close' }]);
});

test('a question finishing its database write after shutdown cannot register a new waiter', async (t) => {
  const h = await harness(t);
  h.session.ctx.storage.deleteAlarm = async () => {};
  h.session.ctx.waitUntil = () => {};
  t.mock.method(h.session, 'flushTranscript', async () => {});
  h.session.live.close = () => {};
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const writing = new Promise<void>((resolve) => { started = resolve; });
  const db = h.session.env.DB as D1Database;
  const prepare = db.prepare.bind(db);
  t.mock.method(db, 'prepare', (sql: string) => {
    const statement = prepare(sql);
    if (!sql.startsWith('INSERT INTO call_questions')) return statement;
    const bind = statement.bind.bind(statement);
    statement.bind = (...args: unknown[]) => {
      const bound = bind(...args);
      const run = bound.run.bind(bound);
      bound.run = async () => {
        started();
        await blocked;
        return run();
      };
      return bound;
    };
    return statement;
  });
  const result = h.ask();
  await writing;
  assert.equal(h.session.waiting.size, 0, 'the question is still being saved');
  await h.session.shutdown('ended during question save');
  release();
  let completed = false;
  void result.then(() => { completed = true; });
  for (let i = 0; i < 20 && !completed; i++) await Promise.resolve();
  assert.equal(completed, true, 'saving must finish without waiting on the ended call');
  assert.equal(await result, 'the call has ended');
  assert.equal((await h.questions()).length, 1, 'the in-flight database write still completes');
  assert.equal(h.session.waiting.size, 0);
  assert.equal(h.session.holding, null);
  t.mock.timers.tick(180_000);
  assert.deepEqual(h.session.live.sent, [{ type: 'session.close' }]);
});
