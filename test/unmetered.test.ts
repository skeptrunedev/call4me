import assert from 'node:assert/strict';
import test from 'node:test';
import { accounts } from '../src/server/services/accounts';
import { calls } from '../src/server/services/calls';
import { holdCreditsRunOutAt } from '../src/server/services/call-store';
import { callbackMinutes } from '../src/server/services/dialer';
import { d1 } from './sqlite-d1';

/** Seconds after an arbitrary, nonzero start (an answered_at of 0 reads as never answered). */
const s = (n: number) => 1_800_000_000_000 + n * 1000;

test('an unmetered account spends with nothing in its balance, which runs below zero; others are still refused', async () => {
  const db = d1();
  const a = accounts(db);
  await a.setUnmetered('acct_alice', true);
  assert.equal(await a.hold('acct_alice', 30 * 25, 'hold:call_1', 'up to 30 min'), true);
  assert.equal(await a.balanceCents('acct_alice'), -30 * 25);
  assert.equal(await a.fundsCents('acct_alice'), Number.POSITIVE_INFINITY);
  assert.equal(await a.hold('acct_bob', 30 * 25, 'hold:call_2', 'up to 30 min'), false);
  assert.equal(await a.fundsCents('acct_bob'), 0);
});

test('a call on an unmetered account is extended in full at every limit, and never warned about', async () => {
  const db = d1();
  await accounts(db).setUnmetered('acct_alice', true);
  await accounts(db).hold('acct_alice', 30 * 25, 'hold:call_1', 'up to 30 min');
  await db
    .prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, hold_cents, answered_at, audio_at, created_at) VALUES ('call_1', 'acct_alice', '+15555550100', 'Air Serbia', 'seat', '{}', 'in_progress', ?, ?, ?, ?)`)
    .bind(30 * 25, s(0), s(0), s(0))
    .run();
  const c = calls(db);
  await c.holdStarted('call_1', s(60));
  assert.equal(await c.extend((await c.byId('call_1'))!, 15, 25, 1, s(30 * 60)), 15);
  assert.ok((await accounts(db).balanceCents('acct_alice')) < 0);
  assert.equal(holdCreditsRunOutAt((await c.byId('call_1'))!, Number.POSITIVE_INFINITY, 25, s(45 * 60)), null);
});

test('a callback to an unmetered account holds the default minutes', () => {
  assert.equal(callbackMinutes(Number.POSITIVE_INFINITY, 25), 30);
});
