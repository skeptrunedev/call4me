import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { Account } from '../src/server/services/accounts';
import { numbers } from '../src/server/services/numbers';
import { d1 } from './sqlite-d1';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const alice = { id: 'acct_alice', email: 'alice@example.com' } as Account;

/** A carrier whose number orders come back `order()` and stay that way until changed. */
function carrier(order: () => string) {
  const c = { orders: 0, status: order, held: [] as { phone_number: string; status: string; connection_id: string }[] };
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path.endsWith('/available_phone_numbers')) return json(200, { data: [{ phone_number: `+1914555010${c.orders}`, cost_information: { upfront_cost: '1', monthly_cost: '1', currency: 'USD' } }] });
    if (path.endsWith('/number_orders') && init?.method === 'POST') {
      c.orders++;
      return json(200, { data: { id: `ord${c.orders}`, status: c.status() } });
    }
    if (/\/number_orders\/ord\d+$/.test(path)) return json(200, { data: { status: c.status() } });
    if (path.endsWith('/phone_numbers') && init?.method !== 'DELETE') return json(200, { data: c.held.filter((n) => n.phone_number === url.searchParams.get('filter[phone_number]')).map((n) => ({ id: n.phone_number, ...n })) });
    if (path.includes('/phone_numbers/') && init?.method === 'DELETE') return json(200, {});
    return json(404, {});
  }) as typeof fetch;
  return c;
}

const env = (db: D1Database) => ({ DB: db, TELNYX_API_KEY: 'test', TELNYX_CONNECTION_ID: 'conn' }) as unknown as Env;

/** Run `p` with setTimeout mocked, ticking it along until it settles. */
async function settled<T>(t: TestContext, p: Promise<T>, stepMs = 500): Promise<{ value?: T; error?: Error }> {
  let out: { value?: T; error?: Error } | null = null;
  p.then((value) => (out = { value }), (error: Error) => (out = { error }));
  for (let i = 0; i < 400 && !out; i++) {
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(stepMs);
  }
  assert.ok(out, 'settled');
  return out!;
}

test('first calls placed at once order one free number and all call from it', async () => {
  // Tom's agent placed five first calls at once: each ordered a number, and four came back 429.
  const db = d1();
  const c = carrier(() => 'success');
  const placed = await Promise.all(Array.from({ length: 5 }, () => numbers(env(db)).ensureIncluded(alice, '+12125550100')));
  assert.equal(c.orders, 1);
  assert.deepEqual(new Set(placed), new Set(['+19145550100']));
});

test("a free number the carrier finishes after the first call stops waiting is kept, and a retry calls from it instead of ordering another", async (t) => {
  // Zack's first call gave up on its order after 30s; the carrier completed it seconds later, a
  // number we paid for that no account had.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const db = d1();
  let status = 'pending';
  const c = carrier(() => status);
  const first = await settled(t, numbers(env(db)).ensureIncluded(alice, '+14155550100'));
  assert.match(first.error?.message ?? '', /free call4me number \(914\) 555-0100 is still being set up by the phone carrier\. nothing was charged/);
  const row = await db.prepare(`SELECT status, order_id, included FROM numbers WHERE account_id = 'acct_alice'`).first();
  assert.deepEqual({ ...row }, { status: 'pending', order_id: 'ord1', included: 1 });

  // Retried while the order is still out: no second order, the same answer.
  const retry = await settled(t, numbers(env(db)).ensureIncluded(alice, '+14155550100'));
  assert.match(retry.error?.message ?? '', /still being set up/);
  assert.equal(c.orders, 1);

  // The carrier finishes it: the cron's settle (or the next call) puts it on the account, free of renewals.
  status = 'success';
  assert.deepEqual(await numbers(env(db)).settlePending(), { activated: 1, failed: 0, waiting: 0 });
  assert.deepEqual({ ...(await db.prepare(`SELECT status, paid_through FROM numbers WHERE account_id = 'acct_alice'`).first()) }, { status: 'active', paid_through: null });
  assert.equal(await numbers(env(db)).ensureIncluded(alice, '+14155550100'), '+19145550100');
  assert.equal(c.orders, 1);
  const refunds = await db.prepare(`SELECT COUNT(*) AS n FROM ledger WHERE account_id = 'acct_alice'`).first<{ n: number }>();
  assert.equal(refunds?.n, 0);
});

test('a free number order the carrier turns down is marked failed, and the next first call orders again', async () => {
  const db = d1();
  let status = 'failure';
  const c = carrier(() => status);
  await assert.rejects(numbers(env(db)).ensureIncluded(alice, '+14155550100'), /turned down/);
  assert.equal((await db.prepare(`SELECT status FROM numbers WHERE account_id = 'acct_alice'`).first<{ status: string }>())?.status, 'failed');
  status = 'success';
  assert.equal(await numbers(env(db)).ensureIncluded(alice, '+14155550100'), '+19145550101');
  assert.equal(c.orders, 2);
  // Nothing was charged for either, so nothing was refunded.
  assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ledger WHERE account_id = 'acct_alice'`).first<{ n: number }>())?.n, 0);
});

test('a number an earlier first call left behind becomes the account\'s free number, only from our carrier account and connection', async () => {
  const db = d1();
  const c = carrier(() => 'success');
  c.held.push({ phone_number: '+14153903398', status: 'active', connection_id: 'conn' }, { phone_number: '+14155550199', status: 'active', connection_id: 'staging' });
  await assert.rejects(numbers(env(db)).adoptIncluded(alice, '+14155550123'), /doesn't hold/);
  await assert.rejects(numbers(env(db)).adoptIncluded(alice, '+14155550199'), /rings connection staging/);
  const view = await numbers(env(db)).adoptIncluded(alice, '+14153903398');
  assert.equal(view.e164, '+14153903398');
  assert.equal(await numbers(env(db)).ensureIncluded(alice, '+14155550100'), '+14153903398');
  assert.equal(c.orders, 0);
  await assert.rejects(numbers(env(db)).adoptIncluded(alice, '+14153903398'), /already has a free number/);
  await assert.rejects(numbers(env(db)).adoptIncluded({ id: 'acct_bob', email: 'bob@example.com' } as Account, '+14153903398'), /already on an account/);
});
