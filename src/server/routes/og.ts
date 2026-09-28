import { Hono } from 'hono';
import type { AppEnv } from '../lib/context';
import { cardSvg } from '../lib/og-card';
import { renderPng } from '../lib/og';
import { CARDS } from '../lib/pages';

/**
 * /og/<card>.png: the Open Graph card for each page (see lib/pages.ts), rendered
 * on demand and cached at the edge. Same approach as skillbay's cards.
 */
export const og = new Hono<AppEnv>();

og.get('/:file{[a-z]+\\.png}', async (c) => {
  const card = CARDS[c.req.param('file').slice(0, -'.png'.length)];
  if (!card) return c.notFound();
  const cache = caches.default;
  const cached = await cache.match(c.req.raw);
  if (cached) return cached;
  const body = await renderPng(cardSvg(card));
  const res = new Response(body as unknown as BodyInit, {
    headers: { 'content-type': 'image/png', 'content-length': String(body.byteLength), 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' },
  });
  c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()));
  return res;
});
