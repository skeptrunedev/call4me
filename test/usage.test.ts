import assert from 'node:assert/strict';
import test from 'node:test';
import { usageView } from '../src/server/services/call-ops';
import { CallError } from '../src/server/services/calls';
import { d1 } from './sqlite-d1';

test('usage totals the calls in the window by day and by business, with credits added and the balance', async () => {
  const db = d1();
  const env = { DB: db } as unknown as Env;
  const now = Date.now();
  const day = 86_400_000;
  const call = (id: string, business: string, at: number, cents: number, seconds: number, hold = 0) =>
    db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at, cost_cents, billed_seconds, hold_seconds) VALUES (?, 'acct_alice', '+12015550100', ?, 'g', '{}', 'completed', ?, ?, ?, ?)`)
      .bind(id, business, at, cents, seconds, hold).run();
  const ledger = (id: string, cents: number, kind: string, at: number) =>
    db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES (?, 'acct_alice', ?, ?, ?, 'n', ?)`).bind(id, cents, kind, id, at).run();
  await ledger('l1', 3935, 'adjustment', now - 40 * day);
  await call('c_old', 'Air Serbia', now - 40 * day, 500, 1200);
  await ledger('l_old', -500, 'call', now - 40 * day);
  await call('c1', 'Stop & Shop', now - 6 * day, 188, 660, 420);
  await ledger('l2', -188, 'call', now - 6 * day);
  await call('c2', 'Stop & Shop', now - 6 * day + 1000, 150, 420, 120);
  await ledger('l3', -150, 'call', now - 6 * day + 1000);
  await call('c3', 'R&J Brothers Electric', now - 1000, 188, 540, 180);
  await ledger('l4', -188, 'call', now - 1000);
  await call('c_free', 'Lee Davis Electric', now - 900, 0, 0);
  await ledger('l5', 1000, 'topup', now - 2 * day);

  const u = await usageView(env, 'acct_alice', 30, 'America/New_York');
  assert.equal(u.calls, 3, 'unanswered calls cost nothing and the 40-day-old one is outside the window');
  assert.equal(u.calls_spent, '$5.26');
  assert.equal(u.hold_minutes, 12);
  assert.equal(u.credits_added, '$10.00');
  assert.equal(u.balance, '$39.09');
  assert.equal(u.by_day.length, 2);
  assert.deepEqual(u.by_business[0], { business: 'Stop & Shop', calls: 2, spent: '$3.38' });

  await assert.rejects(usageView(env, 'acct_alice', 30, 'Not/AZone'), CallError);
});
