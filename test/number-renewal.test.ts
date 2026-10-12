import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { accounts } from '../src/server/services/accounts';
import { numbers, numberView, type NumberRow } from '../src/server/services/numbers';
import type { Messenger } from '../src/server/lib/messaging';
import { d1 } from './sqlite-d1';

const DAY = 86_400_000;
const due = Date.parse('2026-10-01T12:34:00Z');
let env: Env;
let sent: { text: string; html?: string }[];
let released: number;
let failure: string | null;
const messenger: Messenger = { async sendEmail(_to, _subject, text, html) {
  if (failure) throw new Error(failure);
  sent.push({ text, html });
} };
const row = () => env.DB.prepare('SELECT * FROM numbers WHERE id = ?').bind('num').first<NumberRow>();
beforeEach(async () => {
  env = { DB: d1(), TELNYX_API_KEY: 'test', CANONICAL_HOST: 'call4.me', BETTER_AUTH_SECRET: 'test' } as Env;
  sent = []; released = 0; failure = null;
  await env.DB.prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at)
    VALUES ('num', 'acct_alice', '+12025550142', 'US', 'local', 0, 100, ?, 'active', 0)`).bind(due).run();
  globalThis.fetch = (async (input, init) => {
    if (init?.method === 'DELETE') { released++; return Response.json({ data: {} }); }
    assert.match(String(input), /phone_numbers/);
    return Response.json({ data: [{ id: 'carrier_num', phone_number: '+12025550142' }] });
  }) as typeof fetch;
});

test('first failed renewal sends exact deadline and funding link once across concurrent cron runs', async () => {
  await Promise.all([numbers(env, messenger).renewDue(due), numbers(env, messenger).renewDue(due)]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /\$1\.00 monthly fee/);
  assert.match(sent[0].text, /2026-10-08T12:34:00.000Z/);
  assert.match(sent[0].text, /https:\/\/call4.me\/add\/acct_alice-/);
  assert.match(sent[0].html!, /<a href=/);
  await numbers(env, messenger).renewDue(due + DAY);
  assert.equal(sent.length, 1);
  assert.equal(released, 0);
});

test('successful retry charges once and clears warning state for the next period', async () => {
  await numbers(env, messenger).renewDue(due);
  await accounts(env.DB).post('acct_alice', 100, 'adjustment', 'fund', 'fund');
  await Promise.all([numbers(env, messenger).renewDue(due + DAY), numbers(env, messenger).renewDue(due + DAY)]);
  const renewed = (await row())!;
  assert.equal(renewed.paid_through, due + 30 * DAY);
  assert.equal(renewed.renewal_notice_at, null);
  assert.equal(renewed.renewal_email_sent_at, null);
  assert.equal(await accounts(env.DB).balanceCents('acct_alice'), 0);
  await numbers(env, messenger).renewDue(due + 30 * DAY);
  assert.equal(sent.length, 2);
});

test('grace expires at the published deadline and releases unpaid number', async () => {
  await numbers(env, messenger).renewDue(due);
  await numbers(env, messenger).renewDue(due + 7 * DAY - 1);
  assert.equal(released, 0);
  assert.equal(numberView((await row())!, due).release_after, new Date(due + 7 * DAY).toISOString().slice(0, 10));
  await numbers(env, messenger).renewDue(due + 7 * DAY);
  assert.equal(released, 1);
  assert.equal((await row())!.status, 'released');
});

test('already overdue numbers get a day from first attempt, even if SMTP never succeeds', async () => {
  failure = 'SMTP connection failed';
  const at = due + 20 * DAY;
  await numbers(env, messenger).renewDue(at);
  assert.equal(released, 0);
  assert.equal((await row())!.renewal_notice_at, at);
  assert.equal(numberView((await row())!, at).release_after, new Date(at + DAY).toISOString().slice(0, 10));
  await numbers(env, messenger).renewDue(at + DAY - 1);
  assert.equal(released, 0);
  await numbers(env, messenger).renewDue(at + DAY);
  assert.equal(released, 1);
});

test('transient SMTP failure retries without extending the first notice deadline', async () => {
  failure = '421 temporarily unavailable';
  await numbers(env, messenger).renewDue(due);
  assert.equal((await row())!.renewal_email_sent_at, null);
  failure = null;
  await numbers(env, messenger).renewDue(due + 15 * 60_000);
  assert.equal(sent.length, 1);
  assert.equal((await row())!.renewal_notice_at, due);
});

test('terminal recipient rejection is recorded and not retried', async () => {
  failure = 'RCPT TO 550 unknown recipient';
  await numbers(env, messenger).renewDue(due);
  assert.equal((await row())!.renewal_email_rejected_at, due);
  failure = null;
  await numbers(env, messenger).renewDue(due + DAY);
  assert.equal(sent.length, 0);
  await numbers(env, messenger).renewDue(due + 7 * DAY);
  assert.equal(released, 1);
});

test('interrupted SMTP lease recovers after five minutes', async () => {
  await env.DB.prepare('UPDATE numbers SET renewal_notice_at = ?, renewal_email_claim_until = ?').bind(due, due + 300_000).run();
  await numbers(env, messenger).renewDue(due + 299_999);
  assert.equal(sent.length, 0);
  await numbers(env, messenger).renewDue(due + 300_000);
  assert.equal(sent.length, 1);
});

test('included numbers are never warned or released', async () => {
  await env.DB.prepare('UPDATE numbers SET included = 1').run();
  await numbers(env, messenger).renewDue(due + 100 * DAY);
  assert.equal(sent.length, 0);
  assert.equal(released, 0);
});

test('email escapes HTML originating in the configured host', async () => {
  env.CANONICAL_HOST = 'example.com"><img src=x>';
  await numbers(env, messenger).renewDue(due);
  assert.ok(!sent[0].html!.includes('<img'));
  assert.match(sent[0].html!, /&quot;&gt;&lt;img/);
});

test('late successful SMTP retry grants a day matching the actual warning deadline', async () => {
  failure = 'SMTP unavailable';
  await numbers(env, messenger).renewDue(due);
  failure = null;
  const at = due + 8 * DAY;
  await numbers(env, messenger).renewDue(at);
  assert.equal(released, 0);
  const deadline = new Date(at + DAY).toISOString();
  assert.ok(sent[0].text.includes(deadline));
  assert.equal(numberView((await row())!, at).release_after, deadline.slice(0, 10));
  await numbers(env, messenger).renewDue(at + DAY);
  assert.equal(released, 1);
});


test('concurrent cron cannot release during a late SMTP delivery', async () => {
  failure = 'SMTP unavailable';
  await numbers(env, messenger).renewDue(due);
  failure = null;
  let finish!: () => void;
  let started!: () => void;
  const sending = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const slow: Messenger = { async sendEmail(...args) { started(); await gate; await messenger.sendEmail(...args); } };
  const at = due + 8 * DAY;
  const first = numbers(env, slow).renewDue(at);
  await sending;
  await numbers(env, messenger).renewDue(at);
  assert.equal(released, 0);
  finish();
  await first;
  assert.equal(sent.length, 1);
  assert.equal(released, 0);
});
