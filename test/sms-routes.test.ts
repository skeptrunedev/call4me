import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import type { AppEnv } from '../src/server/lib/context';
import type { Account } from '../src/server/services/accounts';
import { sms } from '../src/server/routes/sms';
import { smsConsent } from '../src/server/services/sms-consent';
import { d1 } from './sqlite-d1';

function setup(signedIn = true) {
  const sqlite = d1();
  const db = Object.assign(sqlite, { withSession: () => sqlite as unknown as D1DatabaseSession });
  const app = new Hono<AppEnv>();
  app.use('*', contextStorage());
  app.use('*', async (c, next) => {
    c.set('account', signedIn ? { id: 'acct_alice', email: 'alice@example.com' } as Account : null);
    await next();
  });
  app.route('/', sms);
  const request = (path = '/sms', method = 'GET', body?: string, origin: string | null = 'https://call4.me') => app.request(`https://call4.me${path}`, {
    method,
    headers: { ...(origin === null ? {} : { origin }), 'content-type': 'application/x-www-form-urlencoded' },
    ...(body === undefined ? {} : { body }),
  }, { DB: db } as Env);
  return { db, request };
}

async function seed(db: D1Database) {
  await db.prepare(`INSERT INTO verified_numbers (id, account_id, phone_number, country, method, status, created_at, verified_at) VALUES ('v1', 'acct_alice', '+12025550123', 'US', 'sms', 'verified', 1, 2)`).run();
}

test('public SMS page loads without exposing signed in numbers and disables caching', async () => {
  const { db, request } = setup(false);
  await seed(db);
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.doesNotMatch(await res.text(), /\+12025550123/);
  assert.equal((await request('/sms', 'POST', 'consent=on')).headers.get('location'), '/login?next=/sms');
});

test('both SMS form actions reject absent, null, or foreign origins without changing consent', async () => {
  const { db, request } = setup();
  await seed(db);
  for (const origin of [null, 'null', 'https://evil.example']) {
    for (const path of ['/sms', '/sms/stop']) {
      assert.equal((await request(path, 'POST', 'consent=on&phone_number=%2B12025550123', origin)).status, 403);
    }
  }
  assert.equal(await smsConsent(db).current('acct_alice'), null);
});

test('signup requires explicit consent and verified ownership, then withdrawal disables it', async () => {
  const { db, request } = setup();
  await seed(db);
  for (const body of ['phone_number=%2B12025550123', 'consent=on&phone_number=%2B12025550999']) {
    assert.equal((await request('/sms', 'POST', body)).status, 400);
    assert.equal(await smsConsent(db).current('acct_alice'), null);
  }
  const res = await request('/sms', 'POST', 'consent=on&phone_number=%2B12025550123');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/sms?saved=1');
  assert.equal((await smsConsent(db).current('acct_alice'))?.active, true);
  const page = await request('/sms?saved=1');
  assert.equal(page.headers.get('cache-control'), 'private, no-store');
  assert.match(await page.text(), /turn off text alerts/);
  assert.equal((await request('/sms/stop', 'POST', '')).status, 303);
  assert.equal((await smsConsent(db).current('acct_alice'))?.active, false);
});
