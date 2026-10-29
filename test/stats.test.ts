import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { jsx } from 'hono/jsx';
import type { AppEnv } from '../src/server/lib/context';
import { usageTotals } from '../src/server/services/stats';
import { Layout } from '../src/server/views/layout';
import { d1 } from './sqlite-d1';
import { installEdgeCache } from './edge-cache';

test('aggregate usage counts every connected call in either direction and their whole minutes, excluding never dialed requests', async () => {
  const db = d1();
  assert.deepEqual(await usageTotals(db), { calls: 0, minutes: 0 });
  const insert = (id: string, account: string, direction: string, status: string, providerId: string | null, seconds: number | null) => db.prepare(
    `INSERT INTO calls (id, account_id, direction, to_number, business, goal, brief, status, telnyx_call_control_id, billed_seconds, created_at) VALUES (?, ?, ?, '+14155550123', 'Example', 'hours', '{}', ?, ?, ?, 0)`,
  ).bind(id, account, direction, status, providerId, seconds).run();
  await insert('completed', 'acct_alice', 'outbound', 'completed', 'provider-completed', 150);
  await insert('busy', 'acct_bob', 'outbound', 'busy', 'provider-busy', 0);
  await insert('active', 'acct_bob', 'outbound', 'in_progress', 'provider-active', null);
  await insert('failed-before-dialing', 'acct_alice', 'outbound', 'failed', null, null);
  await insert('queued', 'acct_alice', 'outbound', 'queued', null, null);
  await insert('callback', 'acct_bob', 'inbound', 'completed', 'provider-callback', 45);
  assert.deepEqual(await usageTotals(db), { calls: 4, minutes: 3 });
  await insert('new-call', 'acct_alice', 'outbound', 'dialing', 'provider-new', null);
  assert.deepEqual(await usageTotals(db), { calls: 5, minutes: 3 });
});

test('the shared footer resolves live counts before sending HTML, keeps them in the edge cache, and reports database errors without breaking the page', async () => {
  const cache = installEdgeCache();
  let total = 1234;
  const minutes = 5678;
  let fail = false;
  const db = {
    withSession: (constraint: string) => {
      assert.equal(constraint, 'first-unconstrained');
      return { prepare: () => ({ first: async () => {
        if (fail) throw new Error('database unavailable');
        return { calls: total, minutes };
      } }) };
    },
  } as unknown as D1Database;
  const app = new Hono<AppEnv>();
  app.use('*', contextStorage());
  app.get('/', (c) => c.html(jsx(Layout, { children: 'page content' })));
  const background: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => background.push(p), passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
  const page = async () => {
    const html = await app.request('/', {}, { DB: db } as Env, ctx).then((response) => response.text());
    await Promise.all(background);
    return html;
  };
  const initial = await page();
  assert.match(initial, /operated by Skeptrune LLC/);
  assert.match(initial, /1,234 calls \/ 5,678 minutes/);
  total = 1235;
  assert.match(await page(), /1,234 calls \/ 5,678 minutes/, 'a fresh cached copy is served without D1');
  cache.clear();
  assert.match(await page(), /1,235 calls \/ 5,678 minutes/);
  cache.clear();
  fail = true;
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const html = await page();
    assert.match(html, /page content/);
    assert.match(html, /call count unavailable/);
    assert.doesNotMatch(html, /0 calls/);
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalError;
  }
});
