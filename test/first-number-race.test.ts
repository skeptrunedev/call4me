import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account } from '../src/server/services/accounts';
import { numbers } from '../src/server/services/numbers';
import { d1 } from './sqlite-d1';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test("a first call whose number order is throttled uses the number a concurrent first call bought", async () => {
  // Tom's agent placed five first calls at once: four orders came back 429 and those calls failed.
  const db = d1();
  const env = { DB: db, TELNYX_API_KEY: 'test', TELNYX_CONNECTION_ID: 'conn' } as unknown as Env;
  globalThis.fetch = (async (input: string | URL) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/available_phone_numbers')) return json(200, { data: [{ phone_number: '+19145550100', cost_information: { upfront_cost: '1', monthly_cost: '1', currency: 'USD' } }] });
    if (path.endsWith('/number_orders')) return json(429, { errors: [{ detail: 'You have exceeded the maximum number of allowed requests.' }] });
    return json(404, {});
  }) as typeof fetch;
  // The concurrent call's order lands while this one waits.
  setTimeout(() => void db.prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at) VALUES ('n1', 'acct_alice', '+19145550199', 'US', 'local', 1, 0, NULL, 'active', 0)`).run(), 500);
  assert.equal(await numbers(env).ensureIncluded({ id: 'acct_alice' } as Account, '+12125550100'), '+19145550199');
});
