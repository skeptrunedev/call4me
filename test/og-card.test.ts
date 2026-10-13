import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { cardSvg, OG_WIDTH, OG_HEIGHT, type OgCard } from '../src/server/lib/og-card';
import { CARDS, PAGES } from '../src/server/lib/pages';

const require = createRequire(import.meta.url);
const ready = initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
const fonts = ['LiberationSans-Bold.ttf', 'LiberationSans-Regular.ttf'].map((file) =>
  readFileSync(new URL(`../src/assets/${file}`, import.meta.url)));

/** Renders a card the way the worker does and hands back its RGBA pixels. */
async function pixels(card: OgCard, read: (px: Uint8Array) => void) {
  await ready;
  const renderer = new Resvg(cardSvg(card), {
    font: { fontBuffers: fonts, defaultFontFamily: 'Liberation Sans', sansSerifFamily: 'Liberation Sans', loadSystemFonts: false },
  });
  const rendered = renderer.render();
  try {
    assert.equal(rendered.width, OG_WIDTH);
    assert.equal(rendered.height, OG_HEIGHT);
    read(rendered.pixels);
  } finally {
    rendered.free();
    renderer.free();
  }
}

const is = (px: Uint8Array, x: number, y: number, [r, g, b]: number[]) => {
  const i = (y * OG_WIDTH + x) * 4;
  return px[i] === r && px[i + 1] === g && px[i + 2] === b;
};
const INK = [0x15, 0x15, 0x15];
const MUTED = [0x65, 0x65, 0x5f];

test('OG header leaves breathing room between the wordmark and tagline', () => pixels(CARDS.site, (px) => {
  let wordmarkRight = -1;
  let taglineLeft = OG_WIDTH;
  let taglineRight = -1;
  for (let y = 70; y < 140; y++) {
    for (let x = 150; x < OG_WIDTH; x++) {
      if (is(px, x, y, INK)) wordmarkRight = Math.max(wordmarkRight, x);
      if (is(px, x, y, MUTED)) {
        taglineLeft = Math.min(taglineLeft, x);
        taglineRight = Math.max(taglineRight, x);
      }
    }
  }
  assert.ok(wordmarkRight > 0 && taglineRight > taglineLeft, 'both header elements render');
  assert.ok(taglineLeft - wordmarkRight >= 32, 'at least 32px of clear space after the wordmark');
  assert.ok(taglineRight <= OG_WIDTH - 80, 'tagline stays inside the card padding');
}));

test('every card title stays inside the card padding', async () => {
  const cards = [...Object.values(CARDS), { title: 'Superintelligence superintelligence superintelligence superintelligence calling index', subtitle: 'WWWW '.repeat(40) }];
  for (const card of cards) {
    await pixels(card, (px) => {
      for (let y = 190; y < 510; y++) {
        for (let x = OG_WIDTH - 79; x < OG_WIDTH; x++) {
          assert.ok(!is(px, x, y, INK) && !is(px, x, y, MUTED), `"${card.title}" runs past the right padding at y=${y}`);
        }
      }
    });
  }
});

test('every page points at a card the /og route serves', () => {
  for (const [page, meta] of Object.entries(PAGES)) {
    // routes/og.ts only matches /og/[a-z]+.png, so a camelCase card name 404s.
    assert.match(meta.card, /^[a-z]+$/, `${page} card name`);
    assert.ok(CARDS[meta.card], `${page} card exists`);
  }
});
