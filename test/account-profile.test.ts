import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import type { AppEnv } from '../src/server/lib/context';
import type { Account } from '../src/server/services/accounts';
import { profiles } from '../src/server/services/profiles';
import { pub } from '../src/server/routes/public';
import { d1 } from './sqlite-d1';
import { executionCtx, installEdgeCache } from './edge-cache';

installEdgeCache();

function setup(signedIn = true) {
  const sqlite = d1();
  const db = Object.assign(sqlite, { withSession: () => sqlite as unknown as D1DatabaseSession });
  const app = new Hono<AppEnv>();
  app.use('*', contextStorage());
  app.use('*', async (c, next) => {
    c.set('account', signedIn ? ({ id: 'acct_alice', email: 'alice@example.com' } as Account) : null);
    await next();
  });
  app.route('/', pub);
  const env = { DB: db, BETTER_AUTH_SECRET: 'test-secret', PRICE_PER_MINUTE_CENTS: '25' } as unknown as Env;
  const request = (path: string, method = 'GET', body?: string, origin: string | null = 'https://call4.me') =>
    app.request(`https://call4.me${path}`, { method, headers: { ...(origin === null ? {} : { origin }), 'content-type': 'application/x-www-form-urlencoded' }, ...(body === undefined ? {} : { body }) }, env, executionCtx);
  return { db, request };
}

const seed = (db: D1Database) => profiles(db).update('acct_alice', { full_name: 'Alice Example', date_of_birth: '1990-03-14', phone: '+1 202 555 0123' });

test('the account page shows the saved profile in editable fields, uncached', async () => {
  const { db, request } = setup();
  await seed(db);
  const res = await request('/account');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const html = await res.text();
  assert.match(html, /<h2 id="profile">calling profile<\/h2>/);
  assert.match(html, /name="full_name" value="Alice Example"/);
  assert.match(html, /name="vin" value=""/);
  assert.match(html, /delete my whole calling profile/);
});

test('saving the form updates fields and deletes emptied ones', async () => {
  const { db, request } = setup();
  await seed(db);
  const res = await request('/account/profile', 'POST', 'full_name=Alice+B.+Example&date_of_birth=&phone=%2B1+202+555+0123&vin=');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/account#profile');
  assert.deepEqual(await profiles(db).get('acct_alice'), { full_name: 'Alice B. Example', phone: '+1 202 555 0123' });
});

test('an invalid value is refused with the reason and nothing changes', async () => {
  const { db, request } = setup();
  await seed(db);
  const res = await request('/account/profile', 'POST', 'full_name=Someone+Else&date_of_birth=sometime');
  assert.equal(res.status, 400);
  assert.match(await res.text(), /date_of_birth: use a full date/);
  assert.equal((await profiles(db).get('acct_alice')).full_name, 'Alice Example');
});

test('delete removes the whole profile', async () => {
  const { db, request } = setup();
  await seed(db);
  assert.equal((await request('/account/profile/clear', 'POST', '')).status, 303);
  assert.deepEqual(await profiles(db).get('acct_alice'), {});
});

test('profile forms refuse cross-site posts and signed-out visitors', async () => {
  const { db, request } = setup();
  await seed(db);
  for (const origin of [null, 'null', 'https://evil.example']) {
    assert.equal((await request('/account/profile', 'POST', 'full_name=', origin)).status, 403);
    assert.equal((await request('/account/profile/clear', 'POST', '', origin)).status, 403);
  }
  assert.equal((await profiles(db).get('acct_alice')).full_name, 'Alice Example');
  const out = setup(false);
  assert.equal((await out.request('/account/profile', 'POST', 'full_name=x')).headers.get('location'), '/login?next=/account');
});
