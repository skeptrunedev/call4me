import assert from 'node:assert/strict';
import test from 'node:test';
import { accounts } from '../src/server/services/accounts';
import { calls } from '../src/server/services/calls';
import { d1 } from './sqlite-d1';

/** Seconds after an arbitrary, nonzero start (an answered_at of 0 reads as never answered). */
const s = (n: number) => 1_800_000_000_000 + n * 1000;

async function answeredCall(db: D1Database, holdCents: number) {
  await accounts(db).post('acct_alice', 10_000, 'adjustment', 'seed', 'credits');
  await accounts(db).hold('acct_alice', holdCents, 'hold:call_1', 'up to n min');
  await db
    .prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, hold_cents, answered_at, created_at) VALUES ('call_1', 'acct_alice', '+15555550100', 'Air Serbia', 'seat', '{}', 'in_progress', ?, ?, ?)`)
    .bind(holdCents, s(0), s(0))
    .run();
}

test('a call that spent most of its time on hold is billed at half price for those minutes', async () => {
  const db = d1();
  await answeredCall(db, 30 * 25);
  const c = calls(db);
  await c.holdStarted('call_1', s(60));
  await c.holdEnded('call_1', s(60 + 600));
  const row = await c.finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(720) });
  // 12 started minutes, 10 whole ones on hold: 2 x 25 + 10 x 12.5
  assert.equal(row!.cost_cents, 50 + 125);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000 - 175);
});

test('a hold still open at hangup is billed at half price up to the end', async () => {
  const db = d1();
  await answeredCall(db, 30 * 25);
  await calls(db).holdStarted('call_1', s(0));
  const row = await calls(db).finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(600) });
  assert.equal(row!.cost_cents, 125);
});

test('extending a call on hold holds more credits, all released when it ends, and the bill never passes what was held', async () => {
  const db = d1();
  await answeredCall(db, 5 * 25);
  const c = calls(db);
  const row = (await c.byId('call_1'))!;
  assert.equal(await c.extend(row, 15, 25, 1, s(5 * 60)), 15);
  assert.equal((await c.byId('call_1'))!.hold_cents, 20 * 25);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000 - 20 * 25);
  // Ran 40 minutes with no hold recorded: capped at the 20 minutes held.
  const done = await c.finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(40 * 60) });
  assert.equal(done!.cost_cents, 20 * 25);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000 - 20 * 25);
});

test('an extension the balance cannot cover a minute of is refused and holds nothing', async () => {
  const db = d1();
  await answeredCall(db, 5 * 25);
  await accounts(db).post('acct_alice', -(10_000 - 5 * 25 - 20), 'adjustment', 'drain', 'leave 20 cents');
  const c = calls(db);
  assert.equal(await c.extend((await c.byId('call_1'))!, 15, 25, 1, s(5 * 60)), 0);
  assert.equal((await c.byId('call_1'))!.hold_cents, 5 * 25);
});

test('a call on hold at its limit pays for its extension with the credits its half-price hold left unused', async () => {
  const db = d1();
  // Delta: $7.75 in the account, 30 minutes held at full price, on hold from minute 2 on.
  await answeredCall(db, 30 * 25);
  await accounts(db).post('acct_alice', -(10_000 - 31 * 25), 'adjustment', 'drain', 'leave $7.75');
  const c = calls(db);
  await c.holdStarted('call_1', s(90));
  // 2 minutes talking and 28 on hold cost $4, so $3.50 of the hold is unused: 15 more minutes.
  assert.equal(await c.extend((await c.byId('call_1'))!, 15, 25, 1, s(30 * 60)), 15);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 0);
  const done = await c.finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(45 * 60) });
  // 45 minutes, 43 of them on hold.
  assert.equal(done!.cost_cents, 2 * 25 + Math.ceil((43 * 25) / 2));
});

