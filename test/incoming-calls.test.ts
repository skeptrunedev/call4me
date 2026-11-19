import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import type { AppEnv } from '../src/server/lib/context';
import { accounts } from '../src/server/services/accounts';
import { balanceView } from '../src/server/services/call-ops';
import { pub } from '../src/server/routes/public';
import { d1 } from './sqlite-d1';
import { executionCtx, installEdgeCache } from './edge-cache';

installEdgeCache();

/** The account pages, signed in as Alice, whose account is read fresh on every request as sign-in does. */
function setup() {
  const sqlite = d1();
  const db = Object.assign(sqlite, { withSession: () => sqlite as unknown as D1DatabaseSession });
  const app = new Hono<AppEnv>();
  app.use('*', contextStorage());
  app.use('*', async (c, next) => {
    c.set('account', await accounts(db).byId('acct_alice'));
    await next();
  });
  app.route('/', pub);
  const env = { DB: db, BETTER_AUTH_SECRET: 'test-secret', PRICE_PER_MINUTE_CENTS: '25' } as unknown as Env;
  const request = (path: string, method = 'GET', body?: string, origin = 'https://call4.me') =>
    app.request(`https://call4.me${path}`, { method, headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, ...(body === undefined ? {} : { body }) }, env, executionCtx);
  const answering = async () => (await db.prepare(`SELECT answer_calls FROM accounts WHERE id = 'acct_alice'`).first<{ answer_calls: number }>())!.answer_calls;
  return { db, env, request, answering };
}

test('incoming calls are answered until the account page turns them off, and back on', async () => {
  const { env, db, request, answering } = setup();
  assert.equal(await answering(), 1, 'on by default');
  let html = await (await request('/account')).text();
  assert.match(html, /<h2 id="answering">incoming calls<\/h2>/);
  assert.match(html, /<b>on\.<\/b> with it on, call4me answers calls to your numbers/);
  assert.match(html, /<input type="hidden" name="on" value="0"\/><button type="submit" class="linkbutton">turn off incoming calls<\/button>/);

  const off = await request('/account/answering', 'POST', 'on=0');
  assert.equal(off.status, 303);
  assert.equal(off.headers.get('location'), '/account#answering');
  assert.equal(await answering(), 0);
  html = await (await request('/account')).text();
  assert.match(html, /<b>off\.<\/b> with it on/);
  assert.match(html, />turn on incoming calls<\/button>/);
  const account = (await accounts(db).byId('acct_alice'))!;
  assert.equal((await balanceView(env, account)).answers_incoming_calls, false, 'agents are told too');

  await request('/account/answering', 'POST', 'on=1');
  assert.equal(await answering(), 1);
});

test('the incoming calls switch refuses a post from another site', async () => {
  const { request, answering } = setup();
  const res = await request('/account/answering', 'POST', 'on=0', 'https://evil.example');
  assert.equal(res.status, 403);
  assert.equal(await answering(), 1);
});
