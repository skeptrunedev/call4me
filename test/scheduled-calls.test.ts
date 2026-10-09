import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account } from '../src/server/services/accounts';
import { CallError } from '../src/server/services/calls';
import { parseCallAt, placeDueCalls, SCHEDULE_LIMITS, scheduledCalls, scheduledView } from '../src/server/services/scheduled';
import type { SessionSetup } from '../src/server/voice/session';
import { d1 } from './sqlite-d1';

const alice = { id: 'acct_alice', email: 'alice@example.com', display_name: 'Alice', key_prefix: null, created_at: 0 } as unknown as Account;

const canby = {
  to: '+1 503 266 1156',
  business: 'Canby Utility',
  category: 'general',
  goal: 'Get the utility meters registered in Alice\'s name at the new address.',
  details: { questions: 'Register the meters; ask whether a credit reference can replace the first-and-last deposit.' },
  timezone: 'America/Los_Angeles',
};

const DAY = 86_400_000;
const at = Date.parse('2026-10-02T20:00:00Z');

async function setup() {
  const db = d1();
  // The cron loads the account from the database, so it must match the one the tools were given.
  await db.prepare(`UPDATE accounts SET display_name = 'Alice' WHERE id = 'acct_alice'`).run();
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l1', 'acct_alice', 1000, 'topup', 'test:topup', 'card', 0)`).run();
  return db;
}

test('call_at reads a wall time in the business\'s zone, across DST, or an explicit offset', () => {
  assert.equal(new Date(parseCallAt('2026-10-05T09:15', 'America/Los_Angeles')).toISOString(), '2026-10-05T16:15:00.000Z');
  assert.equal(new Date(parseCallAt('2026-12-01 09:00', 'America/Los_Angeles')).toISOString(), '2026-12-01T17:00:00.000Z');
  assert.equal(new Date(parseCallAt('2026-10-05T09:15:00-07:00', undefined)).toISOString(), '2026-10-05T16:15:00.000Z');
  assert.equal(new Date(parseCallAt('2026-10-05T16:15:00Z', 'Asia/Tokyo')).toISOString(), '2026-10-05T16:15:00.000Z');
  assert.throws(() => parseCallAt('2026-10-05T09:15', undefined), /pass timezone/);
  assert.throws(() => parseCallAt('Monday 9am', 'America/Los_Angeles'), CallError);
});

test('scheduling checks the call now: missing details, a past time, too far ahead', async () => {
  const db = await setup();
  const s = scheduledCalls(db);
  await assert.rejects(s.schedule(alice, { ...canby, details: {} }, '2026-10-05T09:15', 'agents', at), (e) => e instanceof CallError && e.status === 422 && /call call4me_schedule_call again/.test(e.message));
  await assert.rejects(s.schedule(alice, canby, '2026-10-01T09:15', 'agents', at), /already passed/);
  await assert.rejects(s.schedule(alice, canby, new Date(at + SCHEDULE_LIMITS.maxAheadMs + DAY).toISOString(), 'agents', at), /days ahead/);
  const { results } = await db.prepare(`SELECT id FROM scheduled_calls`).all();
  assert.equal(results.length, 0);
});

test('a scheduled call is saved pending with its local time, and holds no credits', async () => {
  const db = await setup();
  const row = await scheduledCalls(db).schedule(alice, canby, '2026-10-05T09:15', 'agents', at);
  const v = scheduledView(row);
  assert.match(v.id, /^sched_/);
  assert.equal(v.status, 'pending');
  assert.equal(v.call_at, '2026-10-05T16:15:00.000Z');
  assert.match(v.call_at_local!, /Monday, October 5, 2026.*9:15/);
  assert.equal(v.number, '(503) 266-1156');
  const bal = await db.prepare(`SELECT SUM(amount_cents) AS b FROM ledger WHERE account_id = 'acct_alice'`).first<{ b: number }>();
  assert.equal(bal!.b, 1000);
});

test('a call that needs an account PIN cannot be scheduled: the PIN is never stored', async () => {
  const db = await setup();
  const input = {
    to: '+1 855 707 7328',
    business: 'Spectrum',
    category: 'internet_existing_account',
    goal: 'Lower the monthly bill.',
    on_behalf_of: 'Alice Smith',
    details: { full_name: 'Alice Smith', account_number: '123', service_address: '1 Main St', phone: '503 555 0100', account_pin: '4321', request: 'lower the bill', limits: 'up to $60/mo' },
  };
  await assert.rejects(scheduledCalls(db).schedule(alice, input, '2026-10-05T09:15:00-07:00', 'agents', at), /never stores/);
  const { results } = await db.prepare(`SELECT input FROM scheduled_calls`).all();
  assert.equal(results.length, 0);
});

test('only pending calls cancel, and only on their own account', async () => {
  const db = await setup();
  const s = scheduledCalls(db);
  const row = await s.schedule(alice, canby, '2026-10-05T09:15', 'agents', at);
  await assert.rejects(s.cancel('acct_bob', row.id), /no such scheduled call/);
  assert.equal((await s.cancel('acct_alice', row.id)).status, 'canceled');
  await assert.rejects(s.cancel('acct_alice', row.id), /is canceled/);
  assert.deepEqual(await s.upcoming('acct_alice'), []);
});

test('the cron dials due calls once, leaves later ones, and never dials a long-missed one late', async () => {
  const db = await setup();
  // Placing fails at the voice deploy lock, after the call row exists: enough to see each call dialed once.
  await db.prepare(`INSERT INTO voice_deploys (id, locked_until) VALUES (1, ?)`).bind(Date.now() + 600_000).run();
  const env = { DB: db, PRICE_PER_MINUTE_CENTS: '25', CANONICAL_HOST: 'call4.me' } as unknown as Env;
  const s = scheduledCalls(db);
  const due = await s.schedule(alice, canby, new Date(at + 60_000).toISOString(), 'agents', at);
  const later = await s.schedule(alice, canby, new Date(at + DAY).toISOString(), 'agents', at);
  const missed = await s.schedule(alice, canby, new Date(at + 60_000).toISOString(), 'agents', at);
  await db.prepare(`UPDATE scheduled_calls SET call_at = ? WHERE id = ?`).bind(at + 60_000 - SCHEDULE_LIMITS.missedAfterMs - 1, missed.id).run();

  const runAt = at + 60_000;
  const [first, second] = await Promise.all([placeDueCalls(env, runAt), placeDueCalls(env, runAt)]);
  assert.equal(first.failed + second.failed, 1);
  assert.equal(first.missed + second.missed, 1);

  const { results: callRows } = await db.prepare(`SELECT id, status FROM calls`).all<{ id: string; status: string }>();
  assert.equal(callRows.length, 1);
  const dialed = await s.forAccount('acct_alice', due.id);
  assert.equal(dialed.status, 'failed');
  assert.equal(dialed.call_id, callRows[0].id);
  assert.match(dialed.error!, /updating its phone service/);
  assert.equal((await s.forAccount('acct_alice', later.id)).status, 'pending');
  const skipped = await s.forAccount('acct_alice', missed.id);
  assert.equal(skipped.status, 'failed');
  assert.equal(skipped.call_id, null);
  assert.match(skipped.error!, /did not dial it late/);
});

test('the cron carries unattended execution into stored voice setup and both prompts', async (t) => {
  const db = await setup();
  await db.prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at)
    VALUES ('num_test', 'acct_alice', '+14155550100', 'US', 'local', 1, 0, 0, 'active', 0)`).run();
  const setups: SessionSetup[] = [];
  let dials = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    assert.equal(String(input), 'https://api.telnyx.com/v2/calls', 'all carrier requests are intercepted');
    dials++;
    return Response.json({ data: { call_control_id: 'test-control' } });
  });
  const env = {
    DB: db, PRICE_PER_MINUTE_CENTS: '25', CANONICAL_HOST: 'call4.me',
    VOICE_HOST: 'voice.test', STREAM_SECRET: 'test-secret',
    VOICE_SESSION: {
      idFromName: (id: string) => id,
      get: () => ({ fetch: async (url: string, init: RequestInit) => {
        if (new URL(url).pathname === '/setup') setups.push(JSON.parse(init.body as string));
        return new Response('ok');
      } }),
    },
  } as unknown as Env;
  await scheduledCalls(db).schedule(alice, canby, new Date(at + 60_000).toISOString(), 'agents', at);
  assert.deepEqual(await placeDueCalls(env, at + 60_000), { placed: 1, failed: 0, missed: 0 });
  assert.equal(dials, 1);
  assert.equal(setups.length, 1);
  assert.equal(setups[0].unattended, true);
  assert.match(setups[0].instructions, /Do not put the other person on hold for a user response/);
  assert.match(setups[0].backOffice, /saves a question but does not wait/);
});
