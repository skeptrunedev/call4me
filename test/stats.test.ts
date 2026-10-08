import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { jsx } from 'hono/jsx';
import type { AppEnv } from '../src/server/lib/context';
import { placedCallCount } from '../src/server/services/stats';
import { Layout } from '../src/server/views/layout';
import { d1 } from './sqlite-d1';

test('aggregate usage counts placed outbound calls across accounts, excluding inbound and never dialed requests', async () => {
  const db = d1();
  assert.equal(await placedCallCount(db), 0);
  const insert = (id: string, account: string, direction: string, status: string, providerId: string | null) => db.prepare(
    `INSERT INTO calls (id, account_id, direction, to_number, business, goal, brief, status, telnyx_call_control_id, created_at) VALUES (?, ?, ?, '+14155550123', 'Example', 'hours', '{}', ?, ?, 0)`,
  ).bind(id, account, direction, status, providerId).run();
  await insert('completed', 'acct_alice', 'outbound', 'completed', 'provider-completed');
  await insert('busy', 'acct_bob', 'outbound', 'busy', 'provider-busy');
  await insert('active', 'acct_bob', 'outbound', 'in_progress', 'provider-active');
  await insert('failed-before-dialing', 'acct_alice', 'outbound', 'failed', null);
  await insert('queued', 'acct_alice', 'outbound', 'queued', null);
  await insert('callback', 'acct_bob', 'inbound', 'completed', 'provider-callback');
  assert.equal(await placedCallCount(db), 3);
  await insert('new-call', 'acct_alice', 'outbound', 'dialing', 'provider-new');
  assert.equal(await placedCallCount(db), 4);
});

test('the shared footer resolves live counts before sending HTML and reports database errors without breaking the page', async () => {
  let total = 1234;
  let fail = false;
  const db = {
    withSession: (constraint: string) => {
      assert.equal(constraint, 'first-unconstrained');
      return { prepare: () => ({ first: async () => {
        if (fail) throw new Error('database unavailable');
        return { total };
      } }) };
    },
  } as unknown as D1Database;
  const app = new Hono<AppEnv>();
  app.use('*', contextStorage());
  app.get('/', (c) => c.html(jsx(Layout, { children: 'page content' })));
  const page = () => app.request('/', {}, { DB: db } as Env).then((response) => response.text());
  assert.match(await page(), /1,234 calls placed/);
  total = 1235;
  assert.match(await page(), /1,235 calls placed/);
  fail = true;
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const html = await page();
    assert.match(html, /page content/);
    assert.match(html, /call count unavailable/);
    assert.doesNotMatch(html, /0 calls placed/);
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalError;
  }
});
