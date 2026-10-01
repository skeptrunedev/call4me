import assert from 'node:assert/strict';
import test from 'node:test';
import { CallError } from '../src/server/services/calls';
import { assertVoiceUnlocked, failNeverDialed, NEVER_DIALED_MS, placeCall, VoiceDeployLocked } from '../src/server/services/dialer';
import type { Account } from '../src/server/services/accounts';
import { d1 } from './sqlite-d1';

const alice = { id: 'acct_alice', email: 'alice@example.com', display_name: 'Alice', key_prefix: null, created_at: 0 } as unknown as Account;

async function setup(lockedUntil: number | null) {
  const db = d1();
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l1', 'acct_alice', 1000, 'topup', 'test:topup', 'card', 0)`).run();
  if (lockedUntil !== null) await db.prepare(`INSERT INTO voice_deploys (id, locked_until) VALUES (1, ?)`).bind(lockedUntil).run();
  return db;
}

const balance = async (db: D1Database) => (await db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS b FROM ledger WHERE account_id = 'acct_alice'`).first<{ b: number }>())!.b;

test('the voice deploy lock refuses only while it is held', async () => {
  const at = 1_000_000;
  await assertVoiceUnlocked(await setup(null), at);
  await assertVoiceUnlocked(await setup(at - 1), at);
  await assert.rejects(assertVoiceUnlocked(await setup(at + 42_500), at), (e) => e instanceof VoiceDeployLocked && e.retryInSeconds === 43);
});

test('a call placed during a voice deploy fails cleanly: retryable error, no queued row, hold released', async () => {
  const db = await setup(Date.now() + 120_000);
  const env = { DB: db, PRICE_PER_MINUTE_CENTS: '25' } as unknown as Env;
  await assert.rejects(
    placeCall(env, 'https://call4.me', alice, { to: '+1 415 555 0123', business: 'Rosa', category: 'general', goal: 'Ask their hours', details: { questions: 'What are your hours?' } }),
    (e) => e instanceof CallError && e.status === 503 && /updating its phone service/.test(e.message),
  );
  const { results } = await db.prepare(`SELECT status, error FROM calls`).all<{ status: string; error: string }>();
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'failed');
  assert.match(results[0].error, /voice deploy in progress/);
  assert.equal(await balance(db), 1000);
});

test('the sweep fails never-dialed calls and releases their holds, and leaves live calls alone', async () => {
  const db = await setup(null);
  const at = 10 * NEVER_DIALED_MS;
  const old = at - NEVER_DIALED_MS - 1;
  const insert = (id: string, status: string, controlId: string | null, createdAt: number) =>
    db
      .prepare(
        `INSERT INTO calls (id, account_id, direction, to_number, business, goal, brief, status, telnyx_call_control_id, hold_cents, created_at) VALUES (?, 'acct_alice', 'outbound', '+14155550123', 'Rosa', 'hours', '{}', ?, ?, 200, ?)`,
      )
      .bind(id, status, controlId, createdAt)
      .run();
  for (const [id, status, controlId, createdAt] of [
    ['call_orphan', 'queued', null, old],
    ['call_fresh', 'queued', null, at - 30_000],
    ['call_dialing', 'dialing', 'v3:abc', old],
    ['call_live', 'in_progress', 'v3:def', old],
  ] as const) {
    await insert(id, status, controlId, createdAt);
    await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES (?, 'acct_alice', -200, 'hold', ?, 'hold', 0)`).bind(`h_${id}`, `hold:${id}`).run();
  }

  assert.equal(await failNeverDialed({ DB: db, PRICE_PER_MINUTE_CENTS: '25' } as unknown as Env, at), 1);
  const { results } = await db.prepare(`SELECT id, status FROM calls ORDER BY id`).all<{ id: string; status: string }>();
  assert.deepEqual(Object.fromEntries(results.map((r) => [r.id, r.status])), { call_dialing: 'dialing', call_fresh: 'queued', call_live: 'in_progress', call_orphan: 'failed' });
  // Four holds of 200 taken from 1000; only the orphan's came back.
  assert.equal(await balance(db), 1000 - 800 + 200);
  // A second sweep changes nothing.
  assert.equal(await failNeverDialed({ DB: db, PRICE_PER_MINUTE_CENTS: '25' } as unknown as Env, at), 0);
});
