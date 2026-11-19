import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { addCreditsPath } from '../src/server/services/drip';
import { warnLowCreditHolds } from '../src/server/services/low-credits';
import { LIMITS, type CallRow } from '../src/server/services/call-store';
import { callPrice } from '../src/server/services/dialer';
import type { Messenger } from '../src/server/lib/messaging';
import { d1 } from './sqlite-d1';

const MIN = 60_000;
const at = Date.parse('2026-11-15T18:00:00Z');
let env: Env;
let sent: { to: string; subject: string; text: string; html?: string }[];
let failure: string | null;
const messenger: Messenger = { async sendEmail(to, subject, text, html) {
  if (failure) throw new Error(failure);
  sent.push({ to, subject, text, html });
} };
const row = () => env.DB.prepare(`SELECT * FROM calls WHERE id = 'call_held'`).first<CallRow>();
const set = (sql: string, ...values: unknown[]) => env.DB.prepare(`UPDATE calls SET ${sql} WHERE id = 'call_held'`).bind(...values).run();

beforeEach(async () => {
  env = { DB: d1(), CANONICAL_HOST: 'call4.me', BETTER_AUTH_SECRET: 'test', PRICE_PER_MINUTE_CENTS: '25' } as Env;
  sent = []; failure = null;
  // On hold for 42 minutes; the voice session found the credits run out 9 minutes from now.
  await env.DB.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, answered_at, hold_since, low_credit_at, low_credit_deadline_at, low_credit_minutes)
    VALUES ('call_held', 'acct_alice', '+18005550100', 'Comcast', 'Cancel the plan', '{}', 'in_progress', ?, ?, ?, ?, ?, 9)`)
    .bind(at - 45 * MIN, at - 44 * MIN, at - 42 * MIN, at, at + 9 * MIN).run();
});

test('a call on hold running out of credits gets one email in minutes, with its add-credits link, across concurrent cron runs', async () => {
  const counts = await Promise.all([warnLowCreditHolds(env, messenger, at), warnLowCreditHolds(env, messenger, at)]);
  assert.deepEqual(counts.sort(), [0, 1]);
  assert.equal(sent.length, 1);
  const link = `https://call4.me${await addCreditsPath('test', 'acct_alice')}`;
  assert.equal(sent[0].to, 'alice@example.com');
  assert.equal(sent[0].subject, 'Your call on hold is about to run out of credits');
  assert.equal(sent[0].text, `Your call to Comcast has been on hold for 42 minutes. Your credits cover about 9 more minutes, then call4me will hang up and the call will lose its place in the queue.\n\nAdd credits and the call keeps holding: ${link}`);
  assert.match(sent[0].html!, new RegExp(`<a href="${link}">add credits</a>`));
  assert.equal((await row())!.low_credit_email_sent_at, at);
  assert.equal((await row())!.low_credit_email_claim_until, null);
  // A later run, still on hold before the deadline, sends nothing more.
  await warnLowCreditHolds(env, messenger, at + 1 * MIN);
  assert.equal(sent.length, 1);
});

/** Credits added since the voice session queued the warning, `short` of its next full extension. */
const topUp = async (short: number) => {
  const full = LIMITS.holdExtensionMinutes * callPrice(env, (await row())!);
  await env.DB.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('t1', 'acct_alice', ?, 'topup', 'test:topup', 'card', ?)`).bind(full - short, at).run();
};

test('credits added since the warning was queued that fund the next extension call it off instead of emailing', async () => {
  // call_qz3qenug5hlh2wp0: $10 added at 10:17:52 PM PT, and the email still went out at 10:19.
  await topUp(0);
  assert.equal(await warnLowCreditHolds(env, messenger, at), 0);
  assert.equal(sent.length, 0);
  const called = (await row())!;
  assert.equal(called.low_credit_deadline_at, null, 'called off, as the watcher reads it');
  assert.equal(called.low_credit_email_sent_at, null);
  assert.equal(called.low_credit_email_claim_until, null);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 1 * MIN), 0, 'and never sent later');
});

test('credits added short of the next full extension still get the warning', async () => {
  await topUp(1);
  assert.equal(await warnLowCreditHolds(env, messenger, at), 1);
  assert.equal(sent.length, 1);
});

test('minutes are counted from when the email goes out', async () => {
  await warnLowCreditHolds(env, messenger, at + 8 * MIN + 30_000);
  assert.match(sent[0].text, /on hold for 50 minutes\. Your credits cover about 1 more minute,/);
});

test('no email once the call has ended or its deadline has passed', async () => {
  await set(`status = 'completed', ended_at = ?, hold_since = NULL`, at);
  assert.equal(await warnLowCreditHolds(env, messenger, at), 0);
  await set(`status = 'in_progress', ended_at = NULL, hold_since = ?`, at - 42 * MIN);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 9 * MIN), 0);
  assert.equal(sent.length, 0);
  assert.equal((await row())!.low_credit_email_sent_at, null);
});

test('a call off hold for now is left for a later run, and emailed once the hold that comes back has lasted 2 minutes', async () => {
  await set('hold_since = NULL');
  assert.equal(await warnLowCreditHolds(env, messenger, at), 0);
  await set('hold_since = ?', at + 1 * MIN);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 3 * MIN - 1), 0);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 3 * MIN), 1);
  assert.match(sent[0].text, /on hold for 2 minutes\. Your credits cover about 6 more minutes,/);
});

test('a recorded greeting taken for a hold gets no email: the warning waits for the hold to last 2 minutes', async () => {
  // call_9pcdwl0vhq0l82iy: the hold started 8s after pickup with 25 minutes of credits left, and a
  // person answered 56s later.
  await set('hold_since = ?, low_credit_deadline_at = ?', at, at + 25 * MIN);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 1 * MIN), 0);
  await set('hold_since = NULL, hold_seconds = 56');
  assert.equal(await warnLowCreditHolds(env, messenger, at + 2 * MIN), 0);
  assert.equal(sent.length, 0);
  // A real hold that starts later still gets its warning.
  await set('hold_since = ?', at + 5 * MIN);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 7 * MIN), 1);
  assert.match(sent[0].text, /on hold for 2 minutes\. Your credits cover about 18 more minutes,/);
});

test('a deadline 5 minutes away is emailed as soon as the hold starts', async () => {
  await set('hold_since = ?, low_credit_deadline_at = ?', at, at + 5 * MIN);
  assert.equal(await warnLowCreditHolds(env, messenger, at), 1);
  assert.match(sent[0].text, /Your credits cover about 5 more minutes,/);
});

test('a deadline 6 minutes away waits for the hold to last 2 minutes', async () => {
  await set('hold_since = ?, low_credit_deadline_at = ?', at, at + 6 * MIN);
  assert.equal(await warnLowCreditHolds(env, messenger, at), 0);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 1 * MIN), 1, 'by then the deadline is 5 minutes away');
});

test('a send another cron run has claimed is left to it until the claim lapses', async () => {
  await set('low_credit_email_claim_until = ?', at + 2 * MIN);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 2 * MIN - 1), 0);
  assert.equal(sent.length, 0);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 2 * MIN), 1);
  assert.equal(sent.length, 1);
});

test('a recipient the mail server refuses is recorded and never retried; other failures are', async () => {
  failure = 'SMTP connection failed';
  assert.equal(await warnLowCreditHolds(env, messenger, at), 0);
  assert.equal((await row())!.low_credit_email_rejected_at, null);
  assert.equal((await row())!.low_credit_email_claim_until, null, 'released for the next run');
  failure = 'RCPT TO 550 unknown recipient';
  await warnLowCreditHolds(env, messenger, at + 1 * MIN);
  assert.equal((await row())!.low_credit_email_rejected_at, at + 1 * MIN);
  failure = null;
  await warnLowCreditHolds(env, messenger, at + 2 * MIN);
  assert.equal(sent.length, 0);
});

test('zero data retention and incoming calls leave the business out', async () => {
  await set('zdr = 1');
  await warnLowCreditHolds(env, messenger, at);
  assert.match(sent[0].text, /^Your call has been on hold for 42 minutes\./);
  assert.ok(!sent[0].text.includes('Comcast') && !sent[0].html!.includes('Comcast'));

  env.DB = d1();
  await env.DB.prepare(`INSERT INTO calls (id, account_id, direction, to_number, business, goal, brief, status, created_at, answered_at, hold_since, low_credit_at, low_credit_deadline_at, low_credit_minutes)
    VALUES ('call_held', 'acct_alice', 'inbound', '+18005550100', 'incoming call', 'take a message', '{}', 'in_progress', ?, ?, ?, ?, ?, 9)`)
    .bind(at - 45 * MIN, at - 44 * MIN, at - 42 * MIN, at, at + 9 * MIN).run();
  await warnLowCreditHolds(env, messenger, at);
  assert.match(sent[1].text, /^Your call has been on hold for 42 minutes\./);
});

test('the business name is escaped in the HTML', async () => {
  await set(`business = '<img src=x onerror=alert(1)> & Co'`);
  await warnLowCreditHolds(env, messenger, at);
  assert.ok(!sent[0].html!.includes('<img'));
  assert.match(sent[0].html!, /&lt;img src=x onerror=alert\(1\)&gt; &amp; Co/);
});
