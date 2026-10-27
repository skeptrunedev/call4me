import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { checkDialable } from '../src/server/lib/phone';
import type { Account } from '../src/server/services/accounts';
import { answeringAccountId, mayCall, numbers } from '../src/server/services/numbers';
import { d1 } from './sqlite-d1';

/**
 * A number call4me shares: alice's Israel number, flagged shared, lets bob (who holds none there)
 * call Israel and go out from it. Callbacks to it reach whoever last called the business.
 */
const SHARED = '+972555077581';
const business = checkDialable('+97235551234');
if (!business.ok) throw new Error('test number');
const bob = { id: 'acct_bob' } as Account;
let db: D1Database;
let env: Env;

async function addNumber(account: string, phone: string, country: string, shared = 0) {
  await db
    .prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at, shared) VALUES (?, ?, ?, ?, 'mobile', 0, 360, 0, 'active', 0, ?)`)
    .bind(`num_${phone}`, account, phone, country, shared)
    .run();
}

async function placed(account: string, from: string, to: string, at: number) {
  await db
    .prepare(`INSERT INTO calls (id, account_id, direction, to_number, from_number, business, goal, brief, status, hold_cents, created_at) VALUES (?, ?, 'outbound', ?, ?, 'clinic', 'book', '{}', 'completed', 0, ?)`)
    .bind(`call_${account}_${at}`, account, to, from, at)
    .run();
}

beforeEach(() => {
  db = d1();
  env = { DB: db, TELNYX_API_KEY: 'test', TELNYX_CONNECTION_ID: 'conn' } as unknown as Env;
});

test('without a shared number, an account with no Israel number cannot call Israel', async () => {
  await addNumber('acct_alice', SHARED, 'IL');
  assert.equal(await mayCall(db, bob.id, business), false);
});

test('a shared Israel number lets every account call Israel, going out from it', async () => {
  await addNumber('acct_alice', SHARED, 'IL', 1);
  assert.equal(await mayCall(db, bob.id, business), true);
  assert.deepEqual(await numbers(env).callerId(bob, business), { number: SHARED, own: false });
});

test("an account's own number in the country is used before the shared one", async () => {
  await addNumber('acct_alice', SHARED, 'IL', 1);
  await addNumber('acct_bob', '+972555074184', 'IL');
  assert.deepEqual(await numbers(env).callerId(bob, business), { number: '+972555074184', own: false });
});

test('a shared number never shows up as one of the other accounts\' own numbers', async () => {
  await addNumber('acct_alice', SHARED, 'IL', 1);
  assert.deepEqual(await numbers(env).views(bob.id), []);
});

test('a callback to a shared number reaches the account that last called that business from it', async () => {
  await addNumber('acct_alice', SHARED, 'IL', 1);
  const at = Date.parse('2026-10-07T12:00:00Z');
  await placed('acct_alice', SHARED, business.e164, at - 3 * 86_400_000);
  await placed('acct_bob', SHARED, business.e164, at - 86_400_000);
  assert.equal(await answeringAccountId(db, SHARED, business.e164, at), 'acct_bob');
});

test('a stranger, or a business called too long ago, reaching a shared number is answered by no one', async () => {
  await addNumber('acct_alice', SHARED, 'IL', 1);
  const at = Date.parse('2026-10-07T12:00:00Z');
  assert.equal(await answeringAccountId(db, SHARED, '+97239999999', at), null);
  await placed('acct_bob', SHARED, business.e164, at - 15 * 86_400_000);
  assert.equal(await answeringAccountId(db, SHARED, business.e164, at), null);
});

test("a callback to an account's own number still reaches that account, whoever calls", async () => {
  await addNumber('acct_bob', '+972555074184', 'IL');
  assert.equal(await answeringAccountId(db, '+972555074184', '+97239999999'), 'acct_bob');
});
