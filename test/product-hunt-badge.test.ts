import assert from 'node:assert/strict';
import test from 'node:test';
import { HomePage } from '../src/server/views/public';
import { Layout } from '../src/server/views/layout';
import { OG_CARD_VERSION } from '../src/server/lib/og-card';

test('homepage has no Product Hunt badge or empty endorsement section', () => {
  const html = String(HomePage({ origin: 'https://call4.me', pricePerMinuteCents: 25, signedIn: false, installPrompt: '', countries: [] }));
  assert.doesNotMatch(html, /producthunt\.com|product-hunt-badge|home-endorsement/);
});

test('shared OG previews use the current card version without changing article images', () => {
  const html = String(Layout({ page: 'home' }));
  for (const tag of ['property="og:image"', 'name="twitter:image"']) {
    assert.ok(html.includes(`${tag} content="https://call4.me/og/site.png?v=${OG_CARD_VERSION}"`));
  }
  const article = String(Layout({ page: 'blog', meta: { image: '/og/blog/example.png' } }));
  assert.ok(article.includes('property="og:image" content="https://call4.me/og/blog/example.png"'));
});
