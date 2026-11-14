import assert from 'node:assert/strict';
import test from 'node:test';
import { answerInbound } from '../src/server/services/dialer';
import { d1 } from './sqlite-d1';

const NUMBER = '+14155550111';
const CALLER = '+14155550123';

/**
 * An account with a number, a task left on the caller's voicemail, and `balance` cents; Telnyx and
 * the voice session record what reaches them, in order, with what the database held at the time.
 */
async function harness(balance = 1000, opts: { answerFails?: boolean } = {}) {
  const db = d1();
  const run = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();
  await run(`UPDATE accounts SET display_name = 'Alice' WHERE id = 'acct_alice'`);
  await run(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l1', 'acct_alice', ?, 'topup', 'test:topup', 'card', 0)`, balance);
  await run(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at) VALUES ('n1', 'acct_alice', ?, 'US', 'local', 1, 0, NULL, 'active', 0)`, NUMBER);
  await run(
    `INSERT INTO calls (id, account_id, direction, to_number, from_number, business, goal, brief, status, hold_cents, outcome, answered_at, created_at) VALUES ('call_task', 'acct_alice', 'outbound', ?, ?, 'Rosa Cafe', 'book a table for two', ?, 'completed', 0, ?, ?, ?)`,
    CALLER,
    NUMBER,
    JSON.stringify({ on_behalf_of: 'Alice', facts: 'party of 2', flexibility: 'any evening', timezone: null, max_minutes: 30 }),
    JSON.stringify({ result: 'voicemail', summary: 'left a voicemail' }),
    Date.now() - 60_000,
    Date.now() - 60_000,
  );
  const events: string[] = [];
  const held = async () => (await db.prepare(`SELECT COUNT(*) AS n FROM ledger WHERE kind = 'hold'`).first<{ n: number }>())!.n;
  const rows = async () => (await db.prepare(`SELECT COUNT(*) AS n FROM calls WHERE direction = 'inbound'`).first<{ n: number }>())!.n;
  let setup: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: string | URL) => {
    const action = new URL(String(input)).pathname.split('/').pop()!;
    events.push(`telnyx ${action} (holds ${await held()}, rows ${await rows()})`);
    return opts.answerFails && action === 'answer'
      ? new Response(JSON.stringify({ errors: [{ code: '90018', detail: 'Call has already ended' }] }), { status: 422, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ data: {} }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const session = {
    fetch: async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/setup') setup = JSON.parse(String(init!.body));
      events.push(`session ${path}`);
      return new Response('ok');
    },
  };
  const env = {
    DB: db,
    PRICE_PER_MINUTE_CENTS: '25',
    TELNYX_API_KEY: 'test',
    STREAM_SECRET: 'secret',
    VOICE_HOST: 'voice.example',
    VOICE_SESSION: { idFromName: (n: string) => n, get: () => session },
  } as unknown as Env;
  const answer = (from = CALLER, to = NUMBER) => answerInbound(env, 'https://call4.me', { controlId: 'v3:ringing', from, to });
  const inbound = () => db.prepare(`SELECT id, status, hold_cents, business FROM calls WHERE direction = 'inbound'`).first<{ id: string; status: string; hold_cents: number; business: string }>();
  const balanceCents = async () => (await db.prepare(`SELECT SUM(amount_cents) AS b FROM ledger`).first<{ b: number }>())!.b;
  return { db, run, events, answer, inbound, balanceCents, setup: () => setup };
}

test("a callback's voice session is reached before anything is read, and we pick up once it prewarmed, with credits held and the row written", async () => {
  // Prod callers hung up 3.0s and 3.4s into the ringing while we took 2.5-3.9s to pick up.
  const h = await harness();
  let eventsAtFirstBatch = -1;
  const batch = h.db.batch.bind(h.db);
  h.db.batch = (async (statements: D1PreparedStatement[]) => {
    if (eventsAtFirstBatch < 0) eventsAtFirstBatch = h.events.length;
    return batch(statements);
  }) as typeof h.db.batch;
  await h.answer();
  assert.equal(eventsAtFirstBatch, 1, 'only the preconnect went out before the first batch read');
  assert.deepEqual(h.events, ['session /preconnect', 'session /setup', 'session /prewarm', 'telnyx answer (holds 1, rows 1)']);
  const row = (await h.inbound())!;
  assert.equal(row.status, 'dialing');
  assert.equal(row.business, 'Rosa Cafe');
  // 30 minutes at 25 cents: the callback default, held up front.
  assert.equal(row.hold_cents, 750);
  assert.equal(await h.balanceCents(), 250);
  const setup = h.setup()!;
  assert.equal(setup.callId, row.id);
  assert.equal(setup.answering, true);
  assert.equal(setup.maxSeconds, 30 * 60);
  assert.match(String(setup.instructions), /Rosa Cafe/);
});

test('a caller from no account, or a blocked one, is refused, and the socket dialed for it closes', async () => {
  const stranger = await harness();
  await stranger.answer(CALLER, '+14155550000');
  assert.deepEqual(stranger.events, ['session /preconnect', 'telnyx reject (holds 0, rows 0)', 'session /ended']);

  const blocked = await harness();
  await blocked.run(`INSERT INTO blocked_numbers (number, reason, created_at) VALUES (?, 'spam', 0)`, CALLER);
  await blocked.answer();
  assert.deepEqual(blocked.events, ['session /preconnect', 'telnyx reject (holds 0, rows 0)', 'session /ended']);
});

test('a balance under a minute is refused before any hold or row, and the socket dialed for it closes', async () => {
  const h = await harness(20);
  await h.answer();
  assert.deepEqual(h.events, ['session /preconnect', 'telnyx reject (holds 0, rows 0)', 'session /ended']);
  assert.equal(await h.balanceCents(), 20);
});

test('a hold another call won between the reads and the hold is refused, with no row', async () => {
  const h = await harness(30);
  // A second call holds the credits in the moment between this one reading the balance and holding it.
  const batch = h.db.batch.bind(h.db);
  h.db.batch = (async (statements: (D1PreparedStatement & { sql: string })[]) => {
    if (statements.some((s) => s.sql.includes('INSERT OR IGNORE INTO ledger'))) {
      await h.run(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l2', 'acct_alice', -25, 'hold', 'hold:call_other', 'other', 0)`);
    }
    return batch(statements);
  }) as typeof h.db.batch;
  await h.answer();
  assert.deepEqual(h.events, ['session /preconnect', 'telnyx reject (holds 1, rows 0)', 'session /ended']);
  assert.equal(await h.inbound(), null);
});

test('a voice deploy in progress refuses the call before pickup and releases its hold', async () => {
  const h = await harness();
  await h.run(`INSERT INTO voice_deploys (id, locked_until) VALUES (1, ?)`, Date.now() + 120_000);
  await h.answer();
  assert.deepEqual(h.events, ['session /preconnect', 'telnyx reject (holds 1, rows 1)', 'session /ended']);
  const row = (await h.inbound())!;
  assert.equal(row.status, 'failed');
  assert.equal(await h.balanceCents(), 1000);
});

test("a call that can't be answered fails, releases its hold and ends its voice session", async () => {
  // Most often the caller hung up while we set up.
  const h = await harness(1000, { answerFails: true });
  await h.answer();
  assert.deepEqual(h.events, ['session /preconnect', 'session /setup', 'session /prewarm', 'telnyx answer (holds 1, rows 1)', 'session /ended']);
  assert.equal((await h.inbound())!.status, 'failed');
  assert.equal(await h.balanceCents(), 1000);
});
