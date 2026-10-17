import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import type { AppEnv } from '../src/server/lib/context';
import { sha256Hex } from '../src/server/lib/keys';
import { callRoutes } from '../src/server/routes/calls';
import { d1 } from './sqlite-d1';

const KEY = 'cb_live_testkey';

async function setup() {
  const sqlite = d1();
  await sqlite.prepare(`UPDATE accounts SET key_hash = ? WHERE id = 'acct_alice'`).bind(await sha256Hex(KEY)).run();
  await sqlite.prepare(`INSERT INTO ledger (account_id, amount_cents, kind, ref, created_at) VALUES ('acct_alice', 1000, 'topup', 'test', 0)`).run();
  const app = new Hono<AppEnv>();
  app.use('*', contextStorage());
  app.route('/', callRoutes);
  const env = { DB: sqlite, PRICE_PER_MINUTE_CENTS: '25' } as unknown as Env;
  return (path: string, init: { method?: string; key?: string | null; body?: unknown } = {}) =>
    app.request(`https://call4.me${path}`, {
      method: init.method ?? 'GET',
      headers: { ...(init.key === null ? {} : { authorization: `Bearer ${init.key ?? KEY}` }), 'content-type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }, env);
}

test('every route refuses a missing or unknown key with 401 and the OAuth challenge', async () => {
  const request = await setup();
  for (const [path, method] of [['/api/balance', 'GET'], ['/api/calls', 'POST'], ['/api/calls/call_x', 'GET'], ['/api/profile', 'PATCH']] as const) {
    for (const key of [null, 'cb_live_wrong']) {
      const res = await request(path, { method, key });
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.match(res.headers.get('www-authenticate') ?? '', /resource_metadata=/);
    }
  }
});

test('balance, categories and a category\'s requirements read the signed in account', async () => {
  const request = await setup();
  const balance = await (await request('/api/balance')).json();
  assert.equal(balance.balance_cents, 1000);
  assert.equal(balance.minutes_left, 40);
  const { categories } = await (await request('/api/requirements')).json();
  assert.ok(categories.some((c: { slug: string }) => c.slug === 'restaurant'));
  const needs = await (await request('/api/requirements/restaurant')).json();
  assert.equal(needs.category, 'restaurant');
  assert.ok(needs.fields.length > 0);
  assert.equal((await request('/api/requirements/nope')).status, 404);
});

test('the profile saves over PATCH and reads back', async () => {
  const request = await setup();
  const saved = await request('/api/profile', { method: 'PATCH', body: { full_name: 'Alice Example' } });
  assert.equal(saved.status, 200);
  assert.deepEqual((await (await request('/api/profile')).json()).profile, { full_name: 'Alice Example' });
});

test('placing a call without what its category needs is refused with 422, listing what to ask', async () => {
  const request = await setup();
  const res = await request('/api/calls', { method: 'POST', body: { to: '+14155550123', business: 'Nopa', goal: 'Book a table for 4', category: 'restaurant' } });
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /^Not calling yet/);
  assert.equal((await request('/api/calls', { method: 'POST', body: { to: '+14155550123' } })).status, 400);
  assert.deepEqual(await (await request('/api/calls')).json(), { calls: [], scheduled: [] });
  assert.equal((await request('/api/calls/call_missing')).status, 404);
});
