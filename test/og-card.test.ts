import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { cardSvg, OG_WIDTH, OG_HEIGHT } from '../src/server/lib/og-card';
import { CARDS } from '../src/server/lib/pages';

test('OG header leaves breathing room between the wordmark and tagline', async () => {
  const require = createRequire(import.meta.url);
  await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
  const renderer = new Resvg(cardSvg(CARDS.site), {
    font: {
      fontBuffers: ['DejaVuSans-Bold.ttf', 'DejaVuSans.ttf'].map((file) =>
        readFileSync(new URL(`../src/assets/${file}`, import.meta.url))),
      defaultFontFamily: 'DejaVu Sans',
      loadSystemFonts: false,
    },
  });
  const rendered = renderer.render();
  try {
    assert.equal(rendered.width, OG_WIDTH);
    assert.equal(rendered.height, OG_HEIGHT);
    const pixels = rendered.pixels;
    let wordmarkRight = -1;
    let taglineLeft = OG_WIDTH;
    let taglineRight = -1;
    for (let y = 70; y < 145; y++) {
      for (let x = 60; x < OG_WIDTH - 60; x++) {
        const i = (y * OG_WIDTH + x) * 4;
        const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
        if (r === 85 && g === 26 && b === 139) wordmarkRight = Math.max(wordmarkRight, x);
        if (r === 102 && g === 102 && b === 102) {
          taglineLeft = Math.min(taglineLeft, x);
          taglineRight = Math.max(taglineRight, x);
        }
      }
    }
    assert.ok(wordmarkRight > 0 && taglineRight > taglineLeft, 'both header elements render');
    assert.ok(taglineLeft - wordmarkRight >= 32, 'at least 32px of clear space after the wordmark');
    assert.ok(taglineRight <= OG_WIDTH - 72, 'tagline stays inside the card padding');
  } finally {
    rendered.free();
    renderer.free();
  }
});
