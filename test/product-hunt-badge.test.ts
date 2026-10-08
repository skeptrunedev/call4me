import assert from 'node:assert/strict';
import test from 'node:test';
import { HomePage } from '../src/server/views/public';
import { Layout } from '../src/server/views/layout';
import { OG_CARD_VERSION } from '../src/server/lib/og-card';

test('homepage embeds the provided Product Hunt badge with a safe outbound link', () => {
  const html = String(HomePage({ origin: 'https://call4.me', pricePerMinuteCents: 25, signedIn: false, installPrompt: '', countries: [] }));
  const badge = html.match(/<p class="product-hunt-badge">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(badge, 'badge appears once on the homepage');
  assert.equal(html.match(/class="product-hunt-badge"/g)?.length, 1);
  const href = badge.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  const src = badge.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  assert.equal(href, 'https://www.producthunt.com/products/call4me?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-call4me');
  assert.equal(src, 'https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1272895&theme=light&t=1791439678864');
  assert.match(badge, /target="_blank" rel="noopener noreferrer"/);
  assert.match(badge, /width="250" height="54"/);
  assert.match(badge, /alt="call4me - Give your AI agent one new tool: make a phone call \| Product Hunt"/);
  assert.ok(html.indexOf('product-hunt-badge') < html.indexOf('class="cols"'), 'badge is near the top, before the main columns');
});

test('shared OG previews use the current card version without changing article images', () => {
  const html = String(Layout({ page: 'home' }));
  for (const tag of ['property="og:image"', 'name="twitter:image"']) {
    assert.ok(html.includes(`${tag} content="https://call4.me/og/site.png?v=${OG_CARD_VERSION}"`));
  }
  const article = String(Layout({ page: 'blog', meta: { image: '/og/blog/example.png' } }));
  assert.ok(article.includes('property="og:image" content="https://call4.me/og/blog/example.png"'));
});
