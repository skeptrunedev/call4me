import assert from 'node:assert/strict';
import test from 'node:test';
import { gaClient, sendGa } from '../src/server/lib/ga';
import { analytics } from '../src/server/services/analytics';
import type { Account } from '../src/server/services/accounts';

test('gaClient reads the client id and both session cookie formats', () => {
  assert.deepEqual(gaClient('a=1; _ga=GA1.1.123456789.1700000000; _ga_YST5YLB3KV=GS1.1.1790830000.3.1.1790830100.0.0.0'), {
    clientId: '123456789.1700000000',
    sessionId: '1790830000',
  });
  assert.deepEqual(gaClient('_ga=GA1.1.42.1700000000; _ga_YST5YLB3KV=GS2.1.s1790830000$o3$g1$t1790830100$j60$l0$h0'), { clientId: '42.1700000000', sessionId: '1790830000' });
  assert.deepEqual(gaClient('_ga=GA1.1.42.1700000000'), { clientId: '42.1700000000', sessionId: null });
  assert.equal(gaClient('_ga=garbage'), null);
  assert.equal(gaClient(undefined), null);
});

/** Captures what would go to GA. */
function captureFetch(): { bodies: Record<string, unknown>[]; urls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    urls.push(url);
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  return { bodies, urls, restore: () => (globalThis.fetch = original) };
}

test('sendGa sends nothing without a secret, and puts events in the browser session', async () => {
  const f = captureFetch();
  try {
    await sendGa({}, { client: { clientId: '1.2', sessionId: null }, events: [{ name: 'purchase' }] });
    assert.equal(f.bodies.length, 0);
    await sendGa({ GA_API_SECRET: 's3cret' }, { client: { clientId: '1.2', sessionId: '99' }, userId: 'acct1', events: [{ name: 'purchase', params: { value: 10 } }] });
    assert.match(f.urls[0], /measurement_id=G-YST5YLB3KV&api_secret=s3cret/);
    assert.deepEqual(f.bodies[0], { client_id: '1.2', user_id: 'acct1', events: [{ name: 'purchase', params: { session_id: '99', engagement_time_msec: 1, value: 10 } }] });
  } finally {
    f.restore();
  }
});

test('sign_up goes out once, ahead of the first tracked event', async () => {
  let claimed = false;
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        run: async () => {
          const won = sql.includes('ga_signup_at IS NULL') && !claimed;
          if (won) claimed = true;
          return { meta: { changes: won ? 1 : 0 } };
        },
        first: async () => ({ provider: 'google' }),
      }),
    }),
  } as unknown as D1Database;
  const account: Account = { id: 'acct1', email: 'a@example.com', display_name: null, key_prefix: null, created_at: 1_790_000_000_000, ga_client_id: '7.8', ga_signup_at: null };
  const f = captureFetch();
  try {
    const ga = analytics({ DB: db, GA_API_SECRET: 's3cret' });
    await ga.purchase(account, { transactionId: 'cs_1', cents: 2000, reload: false });
    await ga.purchase(account, { transactionId: 'cs_2', cents: 1000, reload: false });
    const names = f.bodies.map((b) => (b.events as { name: string }[]).map((e) => e.name));
    assert.deepEqual(names, [['sign_up', 'purchase'], ['purchase']]);
    assert.equal(f.bodies[0].client_id, '7.8');
    assert.deepEqual((f.bodies[0].events as { params: unknown }[])[0].params, { method: 'google' });
  } finally {
    f.restore();
  }
});
