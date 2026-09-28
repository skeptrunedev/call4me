/**
 * Open Graph card SVG template (pure; no WASM so it can be unit-tested under Node).
 * Rendered to PNG by ./og.ts in the worker. Same look as the site (and skillbay's
 * cards): white card, purple wordmark, grey hairlines.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word wrap by estimated glyph width (DejaVu Sans Bold is ~0.62em per char). */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = (line + ' ' + w).trim();
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + '…';
  return lines;
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
  const titleSize = card.title.length > 40 ? 56 : 68;
  const titleLines = wrap(card.title, titleSize > 60 ? 26 : 32, 2);
  const subtitleLines = card.subtitle ? wrap(card.subtitle, 58, 2) : [];
  const titleY = 250;
  const lineH = titleSize * 1.15;
  const subY = titleY + titleLines.length * lineH + 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#ffffff"/>
  <rect x="24" y="24" width="${OG_WIDTH - 48}" height="${OG_HEIGHT - 48}" fill="none" stroke="#cccccc" stroke-width="3"/>
  <text x="72" y="130" font-family="DejaVu Sans" font-weight="bold" font-size="64" fill="#551a8b">callbay</text>
  <text x="352" y="130" font-family="DejaVu Sans" font-size="30" fill="#666666">your AI agent makes phone calls for you</text>
  <line x1="72" y1="166" x2="${OG_WIDTH - 72}" y2="166" stroke="#cccccc" stroke-width="3"/>
  ${titleLines.map((l, i) => `<text x="72" y="${titleY + i * lineH}" font-family="DejaVu Sans" font-weight="bold" font-size="${titleSize}" fill="#222222">${esc(l)}</text>`).join('\n  ')}
  ${subtitleLines.map((l, i) => `<text x="72" y="${subY + i * 44}" font-family="DejaVu Sans" font-size="34" fill="#444444">${esc(l)}</text>`).join('\n  ')}
  ${card.footer ? `<text x="72" y="${OG_HEIGHT - 60}" font-family="DejaVu Sans" font-size="28" fill="#666666">${esc(card.footer)}</text>` : ''}
  <text x="${OG_WIDTH - 72}" y="${OG_HEIGHT - 60}" text-anchor="end" font-family="DejaVu Sans" font-size="28" fill="#0000ee">callbay.skeptrune.com</text>
</svg>`;
}
