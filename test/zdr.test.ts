import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account } from '../src/server/services/accounts';
import { callView } from '../src/server/services/call-ops';
import type { CallRow } from '../src/server/services/calls';
import { callPrice, placeCall } from '../src/server/services/dialer';
import { zdrPrice } from '../src/server/lib/rates';
import { telnyx } from '../src/server/lib/telnyx';
import { DELETED, purgeZdrCalls, RETRY_FIRST_MS, retryDelayMs, ZDR_KEEP_MS } from '../src/server/services/zdr';
import { d1 } from './sqlite-d1';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A zero data retention account (Alice) and a normal one (Bob), one call each, ended two hours ago. */
async function setup() {
  const db = d1();
  await db.prepare(`UPDATE accounts SET zdr = 1 WHERE id = 'acct_alice'`).run();
  const ended = Date.now() - 2 * ZDR_KEEP_MS;
  await db.prepare(
    `INSERT INTO calls (id, account_id, direction, to_number, business, goal, brief, status, telnyx_call_control_id, hold_cents, answered_at, ended_at, transcript, outcome, created_at, zdr)
     VALUES ('call_zdr', 'acct_alice', 'outbound', '+14155550123', 'Rosa', 'Ask their hours', '{"on_behalf_of":"Sam"}', 'completed', 'v3:zdr', 200, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(ended - 60_000, ended, JSON.stringify([{ role: 'caller', text: 'What are your hours?' }]), JSON.stringify({ result: 'done', summary: 'They open at nine.' }), ended - 120_000)
    .run();
  await db.prepare(
    `INSERT INTO calls (id, account_id, direction, to_number, business, goal, brief, status, telnyx_call_control_id, hold_cents, ended_at, transcript, created_at)
     VALUES ('call_kept', 'acct_bob', 'outbound', '+14155550124', 'Kaiser', 'Book a visit', '{}', 'completed', 'v3:kept', 100, ?, ?, ?)`,
  )
    .bind(ended, JSON.stringify([{ role: 'caller', text: 'An appointment please' }]), ended - 120_000)
    .run();
  await db.prepare(`INSERT INTO call_questions (id, call_id, question, answer, asked_at) VALUES ('q1', 'call_zdr', 'Which day?', 'Friday', ?)`).bind(ended - 30_000).run();
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l1', 'acct_alice', 200, 'call', 'call:call_zdr', 'up to 2 min to Rosa', 0)`).run();
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l2', 'acct_alice', 0, 'hold', 'hold:call_zdr:1', '1 more min on hold with Rosa', 0)`).run();
  await db.prepare(`INSERT INTO call_provider_legs (call_control_id, call_leg_id) VALUES ('v3:zdr', 'leg_zdr')`).run();
  return { db, ended };
}

/** Telnyx and the voice session, recording what the purge asked each for. */
function carrier(opts: { deleteFails?: boolean; sessionFails?: number } = {}) {
  const asked: string[] = [];
  let sessions = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    asked.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/v2/recordings' && (init?.method ?? 'GET') === 'GET') {
      return json(200, { data: [{ id: 'rec_zdr', call_control_id: 'v3:zdr', call_leg_id: 'leg_zdr', status: 'completed' }], meta: { total_pages: 1 } });
    }
    if (init?.method === 'DELETE' && url.pathname === '/v2/recordings/rec_zdr') {
      return opts.deleteFails ? json(503, { errors: [{ detail: 'recording store is down' }] }) : json(200, { data: { id: 'rec_zdr' } });
    }
    if (url.pathname === '/v2/webhook_deliveries') return json(200, { data: [], meta: { total_pages: 0 } });
    return json(200, { data: {} });
  }) as typeof fetch;
  const env = {
    DB: undefined as unknown as D1Database,
    TELNYX_API_KEY: 'test',
    VOICE_SESSION: {
      idFromName: (n: string) => n,
      get: (id: string) => ({
        fetch: async (input: string | URL) => {
          asked.push(`SESSION ${id} ${new URL(String(input)).pathname}`);
          sessions++;
          if (sessions <= (opts.sessionFails ?? 0)) return new Response('storage is locked', { status: 500 });
          return new Response('ok');
        },
      }),
    },
  } as unknown as Env;
  return { env, asked, sessionCalls: () => sessions };
}

test('zero data retention bills 1.5x and leaves a normal call price alone', () => {
  assert.equal(zdrPrice(25, 0), 25);
  assert.equal(zdrPrice(25, 1), 38);
  assert.equal(zdrPrice(40, 1), 60);
  assert.equal(zdrPrice(25, false), 25);
  // Rounded up, never below the multiplier.
  assert.ok(zdrPrice(25, 1) >= 25 * 1.5);
});

test('a purge deletes the call content, the questions, the ledger notes, the session and the recording', async () => {
  const { db } = await setup();
  const { env, asked } = carrier();
  env.DB = db;
  const at = Date.now();

  assert.equal(await purgeZdrCalls(env, at), 1);

  const zdr = await db.prepare(`SELECT business, goal, brief, transcript, outcome, purged_at FROM calls WHERE id = 'call_zdr'`).first<{ business: string; goal: string; brief: string; transcript: string | null; outcome: string | null; purged_at: number | null }>();
  assert.equal(zdr!.business, DELETED);
  assert.equal(zdr!.goal, '');
  assert.equal(zdr!.transcript, null);
  assert.equal(zdr!.outcome, null);
  assert.deepEqual(JSON.parse(zdr!.brief), { on_behalf_of: '', facts: '', flexibility: '', timezone: null, max_minutes: 0 });
  assert.equal(zdr!.purged_at, at);

  const questions = await db.prepare(`SELECT COUNT(*) AS n FROM call_questions WHERE call_id = 'call_zdr'`).first<{ n: number }>();
  assert.equal(questions!.n, 0);
  const notes = await db.prepare(`SELECT note FROM ledger WHERE account_id = 'acct_alice' ORDER BY id`).all<{ note: string }>();
  assert.deepEqual(notes.results.map((r) => r.note), ['call', 'call']);
  assert.deepEqual(asked, ['SESSION call_zdr /forget', 'GET /v2/recordings', 'GET /v2/webhook_deliveries', 'DELETE /v2/recordings/rec_zdr']);

  // The other account's call is untouched, and its recording was never asked about.
  const kept = await db.prepare(`SELECT business, transcript, purged_at FROM calls WHERE id = 'call_kept'`).first<{ business: string; transcript: string; purged_at: number | null }>();
  assert.equal(kept!.business, 'Kaiser');
  assert.match(kept!.transcript, /appointment/);
  assert.equal(kept!.purged_at, null);
});

test('a call that ended less than an hour ago keeps its content', async () => {
  const { db } = await setup();
  const { env, asked } = carrier();
  env.DB = db;
  // Another of the same account's calls, ended a minute ago: inside the hour, so nothing to forget.
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, ended_at, created_at, zdr) VALUES ('call_fresh', 'acct_alice', '+14155550123', 'Rosa', 'hours', '{}', 'completed', ?, ?, 1)`).bind(Date.now() - 60_000, Date.now() - 120_000).run();

  assert.equal(await purgeZdrCalls(env, Date.now()), 1);
  const fresh = await db.prepare(`SELECT business, purged_at FROM calls WHERE id = 'call_fresh'`).first<{ business: string; purged_at: number | null }>();
  assert.equal(fresh!.business, 'Rosa');
  assert.equal(fresh!.purged_at, null);
  assert.ok(!asked.some((a) => a.includes('call_fresh')));
});

test('a purge the carrier cannot finish is retried later, and never holds up the calls behind it', async () => {
  const { db } = await setup();
  const { env, sessionCalls } = carrier({ deleteFails: true });
  env.DB = db;
  // A second due call, so the retry has something behind it to get wrong.
  await db.prepare(`UPDATE calls SET telnyx_call_control_id = NULL WHERE id = 'call_kept'`).run();
  const at = Date.now();

  assert.equal(await purgeZdrCalls(env, at), 0);
  const failed = await db.prepare(`SELECT purged_at, purge_attempts, purge_next_at, business FROM calls WHERE id = 'call_zdr'`).first<{ purged_at: number | null; purge_attempts: number; purge_next_at: number | null; business: string }>();
  // The D1 content goes first, every time: the promise is kept even while the carrier retries.
  assert.equal(failed!.business, DELETED);
  assert.equal(failed!.purged_at, null);
  assert.equal(failed!.purge_attempts, 1);
  assert.equal(failed!.purge_next_at, at + RETRY_FIRST_MS);

  // Before its retry time it is skipped, not retried every minute.
  assert.equal(await purgeZdrCalls(env, at + 1_000), 0);
  assert.equal(sessionCalls(), 1);

  // Once due, it tries again and finishes. A fresh carrier succeeds at the delete.
  const retrying = carrier();
  retrying.env.DB = db;
  assert.equal(await purgeZdrCalls(retrying.env, at + RETRY_FIRST_MS + 1), 1);
  const purged = await db.prepare(`SELECT purged_at FROM calls WHERE id = 'call_zdr'`).first<{ purged_at: number | null }>();
  assert.equal(purged!.purged_at, at + RETRY_FIRST_MS + 1);
});

test('the retry delay grows and stops at an hour', () => {
  assert.equal(retryDelayMs(1), RETRY_FIRST_MS);
  assert.equal(retryDelayMs(2), RETRY_FIRST_MS * 2);
  assert.ok(retryDelayMs(3) > retryDelayMs(2));
  assert.equal(retryDelayMs(50), 60 * 60_000);
});

test('a schedule that never became a call keeps no content on a zero data retention account', async () => {
  const { db } = await setup();
  const { env } = carrier();
  env.DB = db;
  const at = Date.now();
  const old = at - 2 * ZDR_KEEP_MS;
  const scheduled = (id: string, account: string, status: string, callAt: number) =>
    db.prepare(`INSERT INTO scheduled_calls (id, account_id, call_at, to_number, business, goal, input, surface, status, created_at) VALUES (?, ?, ?, '+14155550123', 'Rosa', 'Ask their hours', '{"questions":"hours?"}', 'mcp', ?, ?)`)
      .bind(id, account, callAt, status, old)
      .run();
  await scheduled('sched_missed', 'acct_alice', 'failed', old);
  await scheduled('sched_canceled', 'acct_alice', 'canceled', old);
  await scheduled('sched_pending', 'acct_alice', 'pending', at + 60_000);
  await scheduled('sched_other', 'acct_bob', 'failed', old);

  await purgeZdrCalls(env, at);

  const rows = await db.prepare(`SELECT id, business, goal, input FROM scheduled_calls ORDER BY id`).all<{ id: string; business: string; goal: string; input: string }>();
  for (const id of ['sched_canceled', 'sched_missed']) {
    const row = rows.results.find((r) => r.id === id)!;
    assert.equal(row.business, DELETED, id);
    assert.equal(row.goal, '', id);
    assert.equal(row.input, '{}', id);
  }
  assert.equal(rows.results.find((r) => r.id === 'sched_pending')!.business, 'Rosa');
  assert.equal(rows.results.find((r) => r.id === 'sched_other')!.business, 'Rosa');

  // Running it again does not rewrite the same rows.
  const again = await db.prepare(`UPDATE scheduled_calls SET business = ?, goal = '', input = '{}' WHERE call_id IS NULL AND status IN ('failed', 'canceled') AND call_at < ? AND (business <> ? OR goal <> '' OR input <> '{}') AND account_id IN (SELECT id FROM accounts WHERE zdr = 1)`).bind(DELETED, at - ZDR_KEEP_MS, DELETED).run();
  assert.equal(again.meta.changes, 0);
});

test('an answered call is recorded unless zero data retention is on', async () => {
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init!.body)));
    return json(200, { data: {} });
  }) as typeof fetch;
  const env = { TELNYX_API_KEY: 'test' } as unknown as Env;

  await telnyx(env).answer('v3:normal', { webhookUrl: 'https://call4.me/webhooks/telnyx', streamUrl: 'wss://voice.call4.me/stream', callId: 'call_1', timeLimitSecs: 1800, record: true });
  assert.equal(bodies[0]!.record, 'record-from-answer');
  assert.equal(bodies[0]!.record_channels, 'single');
  assert.equal(bodies[0]!.record_format, 'wav');

  await telnyx(env).answer('v3:zdr', { webhookUrl: 'https://call4.me/webhooks/telnyx', streamUrl: 'wss://voice.call4.me/stream', callId: 'call_2', timeLimitSecs: 1800, record: false });
  assert.equal('record' in bodies[1]!, false);
  assert.equal('record_channels' in bodies[1]!, false);
});

test('a call placed on a zero data retention account is stamped, priced at 1.5x and never monitored', async () => {
  const alice = { id: 'acct_alice', email: 'alice@example.com', display_name: 'Alice', key_prefix: null, created_at: 0, zdr: 1 } as unknown as Account;
  const bob = { id: 'acct_bob', email: 'bob@example.com', display_name: 'Bob', key_prefix: null, created_at: 0, zdr: 0 } as unknown as Account;
  const setups: Record<string, unknown>[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (init?.method === 'POST' && url.pathname === '/v2/calls') return json(200, { data: { call_control_id: `v3:${Math.random()}` } });
    if (url.pathname.includes('/verified_numbers/')) return json(200, { data: { phone_number: '+14155550111', verified_at: '2026-10-01T00:00:00' } });
    return json(200, { data: {} });
  }) as typeof fetch;

  const envFor = (db: D1Database) =>
    ({
      DB: db,
      PRICE_PER_MINUTE_CENTS: '25',
      TELNYX_API_KEY: 'test',
      TELNYX_CONNECTION_ID: 'conn',
      STREAM_SECRET: 'secret',
      VOICE_HOST: 'voice.example',
      VOICE_SESSION: {
        idFromName: (n: string) => n,
        get: () => ({ fetch: async (_url: string, init?: RequestInit) => (setups.push(JSON.parse(String(init?.body))), new Response('ok')) }),
      },
    }) as unknown as Env;
  const input = { to: '+1 415 555 0123', business: 'Rosa', category: 'general', goal: 'Ask their hours', details: { questions: 'What are your hours?' } };

  for (const account of [alice, bob]) {
    const db = d1();
    await db.prepare(`UPDATE accounts SET zdr = ? WHERE id = ?`).bind(account.zdr, account.id).run();
    await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l1', ?, 1000, 'topup', 'test:topup', 'card', 0)`).bind(account.id).run();
    await db.prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at) VALUES ('n1', ?, '+14155550111', 'US', 'local', 1, 0, NULL, 'active', 0)`).bind(account.id).run();
    setups.length = 0;
    const call = await placeCall(envFor(db), 'https://call4.me', account, input);
    assert.equal(call.zdr, account.zdr === 1 ? 1 : 0);
    assert.equal(callPrice(envFor(db), call), account.zdr === 1 ? 38 : 25);
    assert.equal(setups[0]!.pricePerMinuteCents, account.zdr === 1 ? 38 : 25);
    assert.equal(setups[0]!.zdr, account.zdr === 1);
  }
});

test('the call view tells the agent the content will be deleted, and that it is gone', () => {
  const base = { id: 'call_1', account_id: 'acct_alice', direction: 'outbound', to_number: '+14155550123', business: 'Rosa', goal: 'Hours', brief: '{}', status: 'completed', open_questions: [], answered_questions: [], callbacks: [], transcript: '[]', talk_minutes: 0, cost: '$0.00', ended: null, error: null, created_at: 0 };
  const live = callView({ ...base, zdr: 1, purged_at: null } as unknown as CallRow, []);
  assert.equal(live.zero_data_retention, true);
  assert.equal(live.content_deleted, false);
  const gone = callView({ ...base, zdr: 1, purged_at: Date.now() } as unknown as CallRow, []);
  assert.equal(gone.content_deleted, true);
  const normal = callView({ ...base, zdr: 0, purged_at: null } as unknown as CallRow, []);
  assert.equal(normal.zero_data_retention, false);
  assert.equal(normal.content_deleted, false);
});
