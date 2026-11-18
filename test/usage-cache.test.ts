import assert from 'node:assert/strict';
import test from 'node:test';
import { cachedUsage, fillUsage, usage } from '../src/server/lib/usage-cache';
import { withUsage } from '../src/server/static-entry';
import { installEdgeCache } from './edge-cache';

const url = 'https://call4.me/pricing';

function counting(totals: { calls: number; minutes: number }) {
  let reads = 0;
  const db = { prepare: () => ({ first: async () => { reads++; return { ...totals }; } }) } as unknown as D1Database;
  const background: Promise<unknown>[] = [];
  return { db, reads: () => reads, ctx: { waitUntil: (p: Promise<unknown>) => background.push(p) }, settle: () => Promise.all(background), totals };
}

test('usage reads D1 once, serves the cached copy while fresh, and refreshes a stale one in the background', async () => {
  const cache = installEdgeCache();
  const h = counting({ calls: 10, minutes: 20 });
  assert.deepEqual(await usage(h.db, url, h.ctx), { calls: 10, minutes: 20 });
  await h.settle();
  h.totals.calls = 11;
  assert.deepEqual(await usage(h.db, 'https://call4.me/blog', h.ctx), { calls: 10, minutes: 20 }, 'one entry for every page');
  assert.equal(h.reads(), 1);

  // Over a minute old: still served at once, while one refresh brings the cache up to date.
  const key = [...cache.keys()][0]!;
  cache.set(key, Response.json({ calls: 10, minutes: 20, at: Date.now() - 61_000 }));
  assert.deepEqual(await usage(h.db, url, h.ctx), { calls: 10, minutes: 20 });
  await h.settle();
  assert.equal(h.reads(), 2);
  assert.equal((await cachedUsage(url))?.calls, 11);
});

test('a burst of page loads on a stale copy counts the calls once, and marks the copy fresh before counting', async () => {
  const cache = installEdgeCache();
  let reads = 0;
  let release!: () => void;
  const counted = new Promise<void>((resolve) => { release = resolve; });
  const db = { prepare: () => ({ first: async () => { reads++; await counted; return { calls: 12, minutes: 30 }; } }) } as unknown as D1Database;
  const background: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => background.push(p) };
  const stale = Date.now() - 61_000;
  cache.set(new URL('/__usage-totals', url).toString(), Response.json({ calls: 10, minutes: 20, at: stale }));

  const pages = await Promise.all(Array.from({ length: 20 }, () => usage(db, url, ctx)));
  assert.ok(pages.every((p) => p.calls === 10), 'every page is served the stale copy at once');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 1, 'one count, not one per page');
  const claimed = await cachedUsage(url);
  assert.equal(claimed?.calls, 10);
  assert.ok(claimed!.at > stale, 'other isolates see a fresh copy while the count runs');

  release();
  await Promise.all(background);
  assert.equal((await cachedUsage(url))?.calls, 12);
});

test('prebuilt pages get the cached totals in place of the loading placeholder, and are untouched without them', async () => {
  installEdgeCache();
  const html = '<footer><span>© call4me</span><span class="footer-usage" data-site-call-count aria-live="polite">loading call count</span></footer>';
  assert.equal(fillUsage(html, { calls: 2703, minutes: 1 }), '<footer><span>© call4me</span><span class="footer-usage" data-site-call-count aria-live="polite"><span>2,703 calls</span> <span>1 minute</span></span></footer>');

  const page = () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(html.length), etag: '"build-42"' } });
  assert.equal(await (await withUsage(page(), url)).text(), html, 'nothing cached yet: the page loads the totals itself');

  const h = counting({ calls: 2703, minutes: 7954 });
  await usage(h.db, url, h.ctx);
  await h.settle();
  const filled = await withUsage(page(), url);
  assert.match(await filled.text(), /><span>2,703 calls<\/span> <span>7,954 minutes<\/span><\/span>/);
  assert.equal(filled.headers.get('content-length'), null);
  assert.equal(filled.headers.get('etag'), '"build-42"');

  const markdown = new Response('# loading call count', { headers: { 'content-type': 'text/markdown' } });
  assert.equal(await (await withUsage(markdown, url)).text(), '# loading call count');
});
