/**
 * Open Graph card SVG template (pure; no WASM so it can be unit-tested under Node).
 * Rendered to PNG by ./og.ts in the worker. Same look as the site and the blog headline
 * images: paper background, ink type in Arial (Liberation Sans in the renderer), the amber
 * phone mark, and an amber waveform.
 */

export const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
/** Bump when the shared card changes so edge caches and new link previews refresh. */
export const OG_CARD_VERSION = '3';

export const OG_FONT = 'Liberation Sans, Arial, Helvetica, sans-serif';
const INK = '#151515';
const MUTED = '#65655f';
const LINE = '#deded8';
const PAPER = '#f6f6f2';
const ACCENT = '#ffb000';
/** The favicon's phone glyph, drawn in a 32x32 box. */
const PHONE = 'M11 7H8a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a15 15 0 0 1-7-7l2-2-2-5Z';
/** Bar heights for the waveform under the text, as in the blog headline images. */
const WAVE = [40, 80, 20, 100, 50, 10, 70, 30, 90, 40, 10, 60];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Liberation Sans advance widths (per 1000 em) for ASCII 32-126, read from the bundled fonts. */
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

interface Type { size: number; bold?: boolean; tracking?: number }

/** Rendered width of `text` in px; characters outside ASCII count as a digit. */
function measure(text: string, { size, bold, tracking = 0 }: Type): number {
  const table = bold ? BOLD : REGULAR;
  let em = 0;
  for (const ch of text) em += table[ch.charCodeAt(0) - 32] ?? 556;
  return (em / 1000) * size + tracking * [...text].length;
}

/** Greedy word wrap to `maxWidth` px; overflow past `maxLines` ends in an ellipsis. */
function wrap(text: string, type: Type, maxWidth: number, maxLines: number): { lines: string[]; fits: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length && lines.length < maxLines; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (line && measure(next, type) > maxWidth) {
      lines.push(line);
      line = words[i]!;
    } else line = next;
  }
  if (lines.length < maxLines && line) {
    lines.push(line);
    line = '';
  }
  const fits = i === words.length && !line;
  if (!fits) {
    let last = lines[maxLines - 1]!;
    while (last.includes(' ') && measure(`${last}…`, type) > maxWidth) last = last.replace(/\s+\S*$/, '');
    lines[maxLines - 1] = `${last.replace(/[\s,.;:]+$/, '')}…`;
  }
  return { lines, fits };
}

export interface OgCard {
  /** Big text, up to two lines. */
  title: string;
  /** Smaller line under the title. */
  subtitle?: string;
  /** Small grey line at the bottom left. */
  footer?: string;
}

export function cardSvg(card: OgCard): string {
  const width = OG_WIDTH - 160;
  // The largest title size that fits in two lines, else the smaller size with an ellipsis.
  const fitted = [76, 64].map((size) => ({ size, type: { size, bold: true, tracking: -size * 0.045 } }))
    .map((t) => ({ ...t, ...wrap(card.title, t.type, width, 2) }));
  const { size: titleSize, type: titleType, lines: titleLines } = fitted.find((t) => t.fits) ?? fitted[fitted.length - 1]!;
  const subtitleLines = card.subtitle ? wrap(card.subtitle, { size: 34 }, width, 2).lines : [];
  const lineH = titleSize * 1.08;
  const titleY = 236 + titleSize * 0.75;
  const subY = titleY + (titleLines.length - 1) * lineH + 66;
  const text = (x: number, y: number, size: number, fill: string, body: string, extra = '') =>
    `<text x="${x}" y="${y}" font-family="${OG_FONT}" font-size="${size}" fill="${fill}"${extra}>${body}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${PAPER}"/>
  <rect x="80" y="76" width="56" height="56" rx="9" fill="${ACCENT}"/>
  <path d="${PHONE}" transform="translate(80 76) scale(1.75)" fill="${INK}"/>
  ${text(154, 122, 48, INK, 'call4me', ' font-weight="bold" letter-spacing="-2.9"')}
  ${text(OG_WIDTH - 80, 122, 28, MUTED, 'your AI agent makes phone calls for you', ' text-anchor="end"')}
  <line x1="80" y1="176" x2="${OG_WIDTH - 80}" y2="176" stroke="${LINE}" stroke-width="2"/>
  ${titleLines.map((l, i) => text(80, Math.round(titleY + i * lineH), titleSize, INK, esc(l), ` font-weight="bold" letter-spacing="${titleType.tracking.toFixed(1)}"`)).join('\n  ')}
  ${subtitleLines.map((l, i) => text(80, Math.round(subY + i * 46), 34, MUTED, esc(l))).join('\n  ')}
  <g fill="${ACCENT}">${WAVE.map((h, i) => `<rect x="${80 + i * 16}" y="${548 - h * 0.3}" width="8" height="${h * 0.6}"/>`).join('')}</g>
  ${card.footer ? text(292, 558, 28, INK, esc(card.footer)) : ''}
  ${text(OG_WIDTH - 80, 558, 28, INK, 'call4.me', ' font-weight="bold" text-anchor="end"')}
</svg>`;
}
