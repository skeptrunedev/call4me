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
