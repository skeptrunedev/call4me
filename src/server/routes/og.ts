import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../lib/context';
import { cardSvg, type OgCard } from '../lib/og-card';
import { renderPng } from '../lib/og';
import { CARDS } from '../lib/pages';
import { posts } from './blog';

/**
 * /og/<card>.png: the Open Graph card for each page (see lib/pages.ts), and
 * /og/blog/<slug>.png: a blog post's headline image. Rendered on demand and cached at
 * the edge. Same approach as skillbay's cards.
 */
export const og = new Hono<AppEnv>();

const PNG_HEADERS = (bytes: number, maxAge: number) => ({ 'content-type': 'image/png', 'content-length': String(bytes), 'cache-control': `public, max-age=${maxAge}`, 'x-content-type-options': 'nosniff' });

/** An SVG rendered to PNG once per URL, then served from the edge cache for `maxAge` seconds. */
async function png(c: AppContext, source: () => Promise<{ svg: string; maxAge: number }>) {
  const cache = caches.default;
  const cached = await cache.match(c.req.raw);
  if (cached) return cached;
  const { svg, maxAge } = await source();
  const body = await renderPng(svg);
  const res = new Response(body as unknown as BodyInit, { headers: PNG_HEADERS(body.byteLength, maxAge) });
  c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()));
  return res;
}

og.get('/:file{[a-z]+\\.png}', (c) => {
  const card = CARDS[c.req.param('file').slice(0, -'.png'.length)];
  if (!card) return c.notFound();
  return png(c, async () => ({ svg: cardSvg(card), maxAge: 86400 }));
});

// A post's headline image (an SVG under /static/blog) rendered to PNG for link previews; a
// post without one gets a card with its title.
og.get('/blog/:file{.+\\.png}', async (c) => {
  const slug = c.req.param('file').slice(0, -'.png'.length);
  const post = posts().find((p) => p.slug === slug);
  if (!post) return c.notFound();
  return png(c, async () => {
    const asset = await c.env.ASSETS.fetch(new Request(new URL(post.image, c.req.url)));
    if (asset.ok) return { svg: await asset.text(), maxAge: 86400 };
    const card: OgCard = { title: post.title, subtitle: post.subtitle, footer: `callbay blog · ${post.date}` };
    return { svg: cardSvg(card), maxAge: 3600 };
  });
});
