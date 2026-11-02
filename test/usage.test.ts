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
  assert.deepEqual(u.by_business[0], { business: 'Stop & Shop', calls: 2, spent: '$3.38', spent_cents: 338 });

  await assert.rejects(usageView(env, 'acct_alice', 30, 'Not/AZone'), CallError);
});

test('the account page shows where the balance went: the total, a bar per day and the top businesses', async () => {
  const { SpendingBox } = await import('../src/server/views/account');
  const { jsx } = await import('hono/jsx');
  const today = new Date().toISOString().slice(0, 10);
  const usage = {
    days: 30, timezone: 'UTC', calls: 2, calls_spent: '$3.38', calls_spent_cents: 338, talk_minutes: 18, hold_minutes: 9,
    numbers_spent: '$0.00', credits_added: '$10.00', balance: '$24.95',
    by_day: [{ date: today, calls: 2, spent: '$3.38', spent_cents: 338 }],
    by_business: [{ business: 'Stop & Shop', calls: 2, spent: '$3.38', spent_cents: 338 }],
  };
  const html = String(await jsx(SpendingBox, { usage }).toString());
  assert.match(html, /<strong>\$3\.38<\/strong> on 2 calls/);
  assert.match(html, /9 of them on hold at half\s+price/);
  assert.equal((html.match(/class="spend-day"/g) ?? []).length, 14);
  assert.match(html, /height:100%/);
  assert.match(html, /Stop &amp; Shop/);
  assert.equal(String(await jsx(SpendingBox, { usage: { ...usage, calls: 0 } }).toString()), '');
});
