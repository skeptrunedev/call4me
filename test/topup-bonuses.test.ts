import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { grantTopupBonuses } from '../src/server/services/topup-bonuses';
import type { Messenger } from '../src/server/lib/messaging';
import { d1 } from './sqlite-d1';

const MIN = 60_000;
const at = Date.parse('2026-11-25T23:30:00Z');
let env: Env;
let sent: { to: string; subject: string; text: string }[];
let failure: Error | null;
const messenger: Messenger = { async sendEmail(to, subject, text) {
  if (failure) throw failure;
  sent.push({ to, subject, text });
} };
const pay = (id: string, cents: number, when: number, kind = 'topup') =>
  env.DB.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES (?, 'acct_alice', ?, ?, ?, 'test', ?)`).bind(id, cents, kind, id, when).run();
const setBonus = (percent: number, remaining: number | null, when: number) =>
  env.DB.prepare(`INSERT INTO topup_bonuses (account_id, percent, remaining, note, created_at) VALUES ('acct_alice', ?, ?, '1.2x promised by email', ?)`).bind(percent, remaining, when).run();
const bonusRow = async () => {
  const row = await env.DB.prepare(`SELECT percent, remaining FROM topup_bonuses WHERE account_id = 'acct_alice'`).first<{ percent: number; remaining: number | null }>();
  return row && { ...row };
};
const adjustments = async () =>
  (await env.DB.prepare(`SELECT amount_cents, ref, note FROM ledger WHERE account_id = 'acct_alice' AND kind = 'adjustment' ORDER BY created_at, ref`).all<{ amount_cents: number; ref: string; note: string }>()).results.map((r) => ({ ...r }));
const balance = async () => (await env.DB.prepare(`SELECT COALESCE(sum(amount_cents), 0) AS c FROM ledger WHERE account_id = 'acct_alice'`).first<{ c: number }>())!.c;

beforeEach(async () => {
  env = { DB: d1(), CANONICAL_HOST: 'call4.me', BETTER_AUTH_SECRET: 'test', PRICE_PER_MINUTE_CENTS: '25' } as Env;
  sent = []; failure = null;
  // Matthew had $3 left and was promised 20% on his next top-up.
  await pay('pay_before', 300, at - 60 * MIN);
  await setBonus(20, 1, at - 30 * MIN);
});

test('a one-time bonus adds 20% to the next payment once, across concurrent cron runs, and emails the new balance', async () => {
  await pay('pay_next', 5000, at - MIN);
  const counts = await Promise.all([grantTopupBonuses(env, messenger, at), grantTopupBonuses(env, messenger, at)]);
  assert.deepEqual(counts.sort(), [0, 1]);
  assert.deepEqual(await adjustments(), [{ amount_cents: 1000, ref: 'bonus:pay_next', note: '20% top-up bonus' }]);
  assert.equal(await balance(), 6300);
  assert.equal(await bonusRow(), null);
  assert.deepEqual(sent, [{
    to: 'alice@example.com',
    subject: 'your call4me bonus credits',
    text: 'your 20% bonus is in: i added $10.00 on top of the $50.00 you just added, so your balance is now $63.00.\n\n- nick',
  }]);
  // The next payment is just a payment, and a rerun changes nothing.
  await pay('pay_later', 5000, at + MIN);
  assert.equal(await grantTopupBonuses(env, messenger, at + 2 * MIN), 0);
  assert.equal((await adjustments()).length, 1);
  assert.equal(sent.length, 1);
});

test('payments made before the bonus was set do not count', async () => {
  assert.equal(await grantTopupBonuses(env, messenger, at), 0);
  assert.deepEqual(await adjustments(), []);
  assert.deepEqual(await bonusRow(), { percent: 20, remaining: 1 });
  assert.equal(sent.length, 0);
});

test('a bonus with uses left counts each down, and an every-payment bonus never runs out', async () => {
  await env.DB.prepare(`UPDATE topup_bonuses SET remaining = 2`).run();
  await pay('pay_1', 1000, at - 2 * MIN);
  await pay('pay_2', 2000, at - MIN, 'reload');
  await pay('pay_3', 4000, at - MIN / 2);
  assert.equal(await grantTopupBonuses(env, messenger, at), 2);
  assert.deepEqual((await adjustments()).map((a) => [a.ref, a.amount_cents]), [['bonus:pay_1', 200], ['bonus:pay_2', 400]]);
  assert.equal(await bonusRow(), null);

  await setBonus(10, null, at);
  await pay('pay_4', 999, at + MIN);
  await pay('pay_5', 2500, at + 2 * MIN);
  assert.equal(await grantTopupBonuses(env, messenger, at + 3 * MIN), 2);
  assert.deepEqual((await adjustments()).slice(2).map((a) => [a.ref, a.amount_cents]), [['bonus:pay_4', 100], ['bonus:pay_5', 250]]);
  assert.deepEqual(await bonusRow(), { percent: 10, remaining: null });
});

test('a failed email is retried once its claim lapses, without granting twice', async () => {
  await pay('pay_next', 2000, at - MIN);
  failure = new Error('smtp timeout');
  assert.equal(await grantTopupBonuses(env, messenger, at), 1);
  assert.equal(sent.length, 0);
  failure = null;
  assert.equal(await grantTopupBonuses(env, messenger, at + MIN), 0);
  assert.equal((await adjustments()).length, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /i added \$4\.00 on top of the \$20\.00/);
});

test('an address that rejects mail is not retried', async () => {
  await pay('pay_next', 2000, at - MIN);
  failure = new Error('Invalid RCPT TO: <alice@example.com> 550 5.1.1 Recipient address rejected: User unknown');
  await grantTopupBonuses(env, messenger, at);
  failure = null;
  await grantTopupBonuses(env, messenger, at + 5 * MIN);
  assert.equal(sent.length, 0);
  assert.equal((await adjustments()).length, 1);
});

test('a bonus turned off before the payment is granted gives nothing', async () => {
  await pay('pay_next', 2000, at - MIN);
  await env.DB.prepare(`DELETE FROM topup_bonuses`).run();
  assert.equal(await grantTopupBonuses(env, messenger, at), 0);
  assert.deepEqual(await adjustments(), []);
});
