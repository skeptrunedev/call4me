import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { addCreditsPath } from '../src/server/services/drip';
import { warnLowCreditHolds } from '../src/server/services/low-credits';
import type { CallRow } from '../src/server/services/call-store';
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
  env = { DB: d1(), CANONICAL_HOST: 'call4.me', BETTER_AUTH_SECRET: 'test' } as Env;
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

test('a call off hold for now is left for a later run, and emailed if the hold comes back in time', async () => {
  await set('hold_since = NULL');
  assert.equal(await warnLowCreditHolds(env, messenger, at), 0);
  await set('hold_since = ?', at + 1 * MIN);
  assert.equal(await warnLowCreditHolds(env, messenger, at + 2 * MIN), 1);
  assert.match(sent[0].text, /on hold for 1 minute\. Your credits cover about 7 more minutes,/);
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
