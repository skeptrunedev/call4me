import assert from 'node:assert/strict';
import test from 'node:test';
import { ENDPOINTS, submitIndexNow } from '../src/server/services/indexnow';

/** Just enough of D1 for submitIndexNow: an empty indexnow_sent table that records batched writes. */
function fakeDb() {
  const writes: unknown[][] = [];
  const db = {
    prepare: () => ({ all: async () => ({ results: [] }), bind: (...args: unknown[]) => args }),
    batch: async (statements: unknown[][]) => void writes.push(...statements),
  };
  return { db: db as unknown as D1Database, writes };
}

test('IndexNow falls through to the next engine when one rejects, and records the accepted URLs', async (t) => {
  const tried: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    tried.push(url);
    return new Response('', { status: tried.length === 1 ? 520 : 202 });
  });
  t.mock.method(console, 'error', () => {});
  const { db, writes } = fakeDb();
  const result = await submitIndexNow({ db, site: 'https://call4.me', key: 'k', entries: [{ loc: 'https://call4.me/blog/a', lastmod: '2026-10-13' }] });
  assert.deepEqual(tried, ENDPOINTS.slice(0, 2));
  assert.deepEqual(result, { sent: 1, status: 202 });
  assert.equal(writes.length, 1);
});

test('IndexNow records nothing when every engine rejects, so the next run retries', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 520 }));
  t.mock.method(console, 'error', () => {});
  const { db, writes } = fakeDb();
  const result = await submitIndexNow({ db, site: 'https://call4.me', key: 'k', entries: [{ loc: 'https://call4.me/blog/a', lastmod: '2026-10-13' }] });
  assert.deepEqual(result, { sent: 0, status: 520 });
  assert.equal(writes.length, 0);
});
