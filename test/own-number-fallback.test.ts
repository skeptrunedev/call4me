import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account } from '../src/server/services/accounts';
import { placeCall } from '../src/server/services/dialer';
import { d1 } from './sqlite-d1';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const alice = { id: 'acct_alice', email: 'alice@example.com', display_name: 'Alice', key_prefix: null, created_at: 0 } as unknown as Account;

test("a call the carrier refuses from the user's own number goes out from their call4me number", async () => {
  // Tassos and Leonardo: Telnyx refused their verified Greek and Belgian numbers calling in their
  // own countries (PE5) and the calls failed, though their call4me numbers reach the same places.
  const db = d1();
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l1', 'acct_alice', 1000, 'topup', 'test:topup', 'card', 0)`).run();
  await db.prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at) VALUES ('n1', 'acct_alice', '+14155550111', 'US', 'local', 1, 0, NULL, 'active', 0)`).run();
  await db.prepare(`INSERT INTO verified_numbers (account_id, phone_number, country, method, status, created_at, verified_at) VALUES ('acct_alice', '+14155550188', 'US', 'sms', 'verified', 0, 0)`).run();
  const dialed: string[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === 'POST' && path === '/v2/calls') {
      const from = (JSON.parse(String(init.body)) as { from: string }).from;
      dialed.push(from);
      return from === '+14155550188' ? json(403, { errors: [{ code: '10010', detail: 'No Routes Found PE5. No routes found.' }] }) : json(200, { data: { call_control_id: 'v3:ok' } });
    }
    if (path.includes('/verified_numbers/')) return json(200, { data: { phone_number: '+14155550188', verified_at: '2026-10-01T00:00:00' } });
    return json(200, { data: {} });
  }) as typeof fetch;
  const session = { fetch: async () => new Response('ok') };
  const env = {
    DB: db,
    PRICE_PER_MINUTE_CENTS: '25',
    TELNYX_API_KEY: 'test',
    TELNYX_CONNECTION_ID: 'conn',
    STREAM_SECRET: 'secret',
    VOICE_HOST: 'voice.example',
    VOICE_SESSION: { idFromName: (n: string) => n, get: () => session },
  } as unknown as Env;
  const call = await placeCall(env, 'https://call4.me', alice, { to: '+1 415 555 0123', from: '+1 415 555 0188', business: 'Rosa', category: 'general', goal: 'Ask their hours', details: { questions: 'What are your hours?' } });
  assert.deepEqual(dialed, ['+14155550188', '+14155550111']);
  assert.equal(call.from_number, '+14155550111');
  assert.equal(call.ring_number, null);
  assert.equal(call.status, 'dialing');
});
