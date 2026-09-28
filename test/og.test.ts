import { describe, expect, it } from 'vitest';
import { cardSvg } from '../src/server/lib/og-card';
import { CARDS, PAGES } from '../src/server/lib/pages';

describe('link previews', () => {
  it('every page points at a card that exists', () => {
    for (const [page, meta] of Object.entries(PAGES)) {
      expect(CARDS[meta.card], `${page} -> ${meta.card}`).toBeDefined();
      expect(meta.path.startsWith('/'), page).toBe(true);
      expect(meta.description.length, page).toBeGreaterThan(40);
    }
  });

  it('cards render as 1200x630 SVG with escaped text', () => {
    for (const card of Object.values(CARDS)) {
      const svg = cardSvg(card);
      expect(svg).toContain('width="1200" height="630"');
      // Every & in the markup must start an entity, or resvg rejects the SVG.
      expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
    }
    expect(cardSvg({ title: 'a <b> & "c"' })).toContain('a &lt;b&gt; &amp; &quot;c&quot;');
  });
});
