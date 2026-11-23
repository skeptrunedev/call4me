import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/server/lib/context';
import { apiLog } from '../src/server/lib/api-log';
import { sha256Hex } from '../src/server/lib/keys';
import { callRoutes } from '../src/server/routes/calls';
import { d1 } from './sqlite-d1';

// An agent on the REST API was refused POST /api/calls with a 400 91 times in an hour (Nov 22,
// 2026), and nothing logged whose account it was or what the error said.
const KEY = `cb_live_${'a'.repeat(32)}`;

async function setup(t: TestContext) {
  const db = d1();
  await db.prepare(`UPDATE accounts SET key_hash = ? WHERE id = 'acct_alice'`).bind(await sha256Hex(KEY)).run();
  const app = new Hono<AppEnv>();
  app.use('/api/*', apiLog);
  app.route('/', callRoutes);
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: unknown) => lines.push(String(line)));
  const request = (path: string, init: RequestInit = {}) => app.request(`https://call4.me${path}`, init, { DB: db } as Env);
  return { request, lines };
}

test('a refused API call logs the account and the error it returned, never the request body', async (t) => {
  const { request, lines } = await setup(t);
  const res = await request('/api/calls', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ business: 'Dr. Example Dental', goal: 'Book a cleaning for Jane Doe, born 1990-01-01' }),
  });
  assert.equal(res.status, 400);
  const { error } = (await res.json()) as { error: string };
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^api POST \/api\/calls account=acct_alice \d+ms 400 error: /);
  assert.ok(lines[0].endsWith(error.replace(/\s+/g, ' ').slice(0, 200)));
  assert.doesNotMatch(lines[0], /Jane Doe|1990/);
});

test('a signed-in API request that works logs ok, and one with no valid key logs nothing', async (t) => {
  const { request, lines } = await setup(t);
  assert.equal((await request('/api/balance', { headers: { authorization: `Bearer ${KEY}` } })).status, 200);
  assert.match(lines.at(-1) ?? '', /^api GET \/api\/balance account=acct_alice \d+ms ok$/);
  const before = lines.length;
  assert.equal((await request('/api/calls', { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await request('/api/balance', { headers: { authorization: `Bearer cb_live_${'b'.repeat(32)}` } })).status, 401);
  assert.equal(lines.length, before);
});
