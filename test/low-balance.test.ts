import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { addCreditsPath } from '../src/server/services/drip';
import { emailLowBalanceRefusals } from '../src/server/services/low-balance';
import type { Messenger } from '../src/server/lib/messaging';
import { d1 } from './sqlite-d1';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const at = Date.parse('2026-11-22T05:11:00Z');
let env: Env;
let sent: { to: string; subject: string; text: string; html?: string }[];
let failure: Error | null;
const messenger: Messenger = { async sendEmail(to, subject, text, html) {
  if (failure) throw failure;
  sent.push({ to, subject, text, html });
} };
const ledger = (cents: number, ref: string) =>
  env.DB.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES (?, 'acct_alice', ?, 'topup', ?, 'test', ?)`).bind(ref, cents, ref, at).run();
const refuse = (when: number) => env.DB.prepare(`UPDATE accounts SET low_balance_refused_at = ? WHERE id = 'acct_alice'`).bind(when).run();
const account = async () => ({ ...(await env.DB.prepare(`SELECT low_balance_refused_at, low_balance_email_at, low_balance_email_claim_until FROM accounts WHERE id = 'acct_alice'`).first<Record<string, number | null>>()) });

beforeEach(async () => {
  env = { DB: d1(), CANONICAL_HOST: 'call4.me', BETTER_AUTH_SECRET: 'test', PRICE_PER_MINUTE_CENTS: '25' } as Env;
  sent = []; failure = null;
  // chloem0910: $0.12 left, and their ChatGPT's call was refused a minute ago.
  await ledger(12, 'test:left');
  await refuse(at - MIN);
});

test('an account refused a call for its balance gets one email with its add-credits link, across concurrent cron runs', async () => {
  const counts = await Promise.all([emailLowBalanceRefusals(env, messenger, at), emailLowBalanceRefusals(env, messenger, at)]);
  assert.deepEqual(counts.sort(), [0, 1]);
  assert.equal(sent.length, 1);
  const link = `https://call4.me${await addCreditsPath('test', 'acct_alice')}`;
  assert.equal(sent[0].to, 'alice@example.com');
  assert.equal(sent[0].subject, 'Add credits to keep making calls');
  assert.equal(sent[0].text, `call4me couldn't place your last call: your balance is $0.12, less than a minute of calling.\n\nAdd credits, then ask your assistant to try again: ${link}`);
  assert.match(sent[0].html!, new RegExp(`<a href="${link}">add credits</a>`));
  assert.deepEqual(await account(), { low_balance_refused_at: at - MIN, low_balance_email_at: at, low_balance_email_claim_until: null });
});

test('an agent retrying all day gets the user one email a day', async () => {
  await emailLowBalanceRefusals(env, messenger, at);
  await refuse(at + 30 * MIN);
  assert.equal(await emailLowBalanceRefusals(env, messenger, at + 31 * MIN), 0);
  await refuse(at + DAY);
  assert.equal(await emailLowBalanceRefusals(env, messenger, at + DAY + MIN), 1);
  assert.equal(sent.length, 2);
});

test('credits added since the refusal call the email off', async () => {
  await ledger(1000, 'test:topup');
  assert.equal(await emailLowBalanceRefusals(env, messenger, at), 0);
  assert.equal(sent.length, 0);
  assert.equal((await account())!.low_balance_refused_at, null);
});

test('a refusal over an hour old is not emailed about', async () => {
  await refuse(at - 61 * MIN);
  assert.equal(await emailLowBalanceRefusals(env, messenger, at), 0);
});

test('a failed send is retried once its claim lapses', async () => {
  failure = new Error('smtp timeout');
  assert.equal(await emailLowBalanceRefusals(env, messenger, at), 0);
  assert.deepEqual(await account(), { low_balance_refused_at: at - MIN, low_balance_email_at: null, low_balance_email_claim_until: null });
  failure = null;
  assert.equal(await emailLowBalanceRefusals(env, messenger, at + MIN), 1);
});
