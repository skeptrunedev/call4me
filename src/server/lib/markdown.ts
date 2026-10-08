/**
 * Markdown for agents: turn one of our server-rendered pages into markdown when a
 * client asks for `Accept: text/markdown`. The pages are simple, hand-written HTML
 * (headings, paragraphs, lists, tables, code, links), so a small tokenizer does the
 * job without a DOM. Site chrome (masthead, nav, footer, forms, scripts, hidden prompts)
 * is dropped; a visible prompt textarea (the install prompt) is kept as a fenced block,
 * since it is the part an agent most needs. The page title becomes the H1 if the body has none.
 */

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
const DROP = new Set(['script', 'style', 'noscript', 'svg', 'select', 'button', 'head', 'nav', 'footer', 'form']);
const DROP_IDS = new Set(['masthead', 'topnav']);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", middot: '·', hellip: '…', mdash: '—', ndash: '–', copy: '©', rarr: '→' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k]!;
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return m;
  });
}

interface Tok {
  type: 'open' | 'close' | 'text';
  name?: string;
  attrs?: Record<string, string>;
  text?: string;
  selfClosing?: boolean;
}

function tokenize(html: string): Tok[] {
  const out: Tok[] = [];
  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) out.push({ type: 'close', name: m[1].toLowerCase() });
    else if (m[2]) {
      const attrs: Record<string, string> = {};
      for (const a of m[3]!.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]!.toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
      out.push({ type: 'open', name: m[2].toLowerCase(), attrs, selfClosing: m[4] === '/' || VOID.has(m[2].toLowerCase()) });
    } else if (m[5]) out.push({ type: 'text', text: m[5] });
  }
  return out;
}

/** Visible prose for reading estimates; optional collapsed details and media are excluded. */
export function htmlToReadableText(html: string): string {
  const out: string[] = [];
  const stack: { name: string; dropped: boolean }[] = [];
  const blocks = new Set(['p', 'div', 'section', 'article', 'main', 'blockquote', 'li', 'tr', 'th', 'td', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr']);
  for (const token of tokenize(html)) {
    if (token.type === 'text') {
      if (!stack.at(-1)?.dropped) out.push(decodeEntities(token.text!));
      continue;
    }
    const name = token.name!;
    if (token.type === 'open') {
      const attrs = token.attrs ?? {};
      const dropped = !!stack.at(-1)?.dropped || DROP.has(name) || name === 'audio' || name === 'video'
        || (name === 'details' && attrs.open === undefined)
        || attrs.hidden !== undefined || attrs['aria-hidden'] === 'true';
      if (!dropped && blocks.has(name)) out.push(' ');
      if (!token.selfClosing) stack.push({ name, dropped });
    } else {
      const index = stack.map((entry) => entry.name).lastIndexOf(name);
      if (index >= 0) stack.splice(index);
      if (!stack.at(-1)?.dropped && blocks.has(name)) out.push(' ');
    }
  }
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** Convert a page's HTML to markdown. `base` makes relative links absolute. */
export function htmlToMarkdown(html: string, base: string): string {
  const toks = tokenize(html);
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  const out: string[] = [];
  let buf = '';
  const stack: { name: string; attrs: Record<string, string>; dropped: boolean }[] = [];
  let dropDepth = 0;
  let pre = false;
  const listStack: { ordered: boolean; n: number }[] = [];
  let row: string[] | null = null;
  let table: string[][] | null = null;
  let cell = '';
  let headerRow = false;

  const flush = () => {
    const t = pre ? buf.replace(/^\n+|\n+$/g, '') : buf.replace(/[ \t\n]+/g, ' ').trim();
    if (t) out.push(t);
    buf = '';
  };
  const abs = (href: string) => {
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  };
  const inTable = () => table !== null;
  const write = (s: string) => {
    if (inTable() && row) cell += s;
    else buf += s;
  };

  for (const t of toks) {
    if (t.type === 'text') {
      if (dropDepth) continue;
      const text = pre ? decodeEntities(t.text!) : decodeEntities(t.text!).replace(/\s+/g, ' ');
      write(text);
      continue;
    }
    const name = t.name!;
    if (t.type === 'open') {
      const attrs = t.attrs ?? {};
      const dropped = DROP.has(name) || (!!attrs.id && DROP_IDS.has(attrs.id)) || attrs.hidden !== undefined || attrs['aria-hidden'] === 'true';
      if (dropped || dropDepth) {
        if (!t.selfClosing) {
          stack.push({ name, attrs, dropped });
          if (dropped) dropDepth++;
        }
        continue;
      }
      switch (name) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          flush();
          write('#'.repeat(Number(name[1])) + ' ');
          break;
        case 'p': case 'div': case 'section': case 'article': case 'main': case 'blockquote':
          flush();
          if (name === 'blockquote') write('> ');
          break;
        case 'br':
          write(pre ? '\n' : '  \n');
          break;
        case 'hr':
          flush();
          out.push('---');
          break;
        case 'ul': case 'ol':
          flush();
          listStack.push({ ordered: name === 'ol', n: 0 });
          break;
        case 'li': {
          flush();
          const l = listStack[listStack.length - 1] ?? { ordered: false, n: 0 };
          l.n++;
          write('  '.repeat(Math.max(0, listStack.length - 1)) + (l.ordered ? `${l.n}. ` : '- '));
          break;
        }
        case 'pre':
        case 'textarea':
          flush();
          pre = true;
          write('```\n');
          break;
        case 'code':
          if (!pre) write('`');
          break;
        case 'b': case 'strong':
          write('**');
          break;
        case 'i': case 'em':
          write('*');
          break;
        case 'a':
          write('[');
          break;
        case 'img':
          write(attrs.alt ? `![${attrs.alt}](${abs(attrs.src ?? '')})` : '');
          break;
        case 'table':
          flush();
          table = [];
          break;
        case 'tr':
          row = [];
          headerRow = false;
          break;
        case 'th':
          headerRow = true;
          cell = '';
          break;
        case 'td':
          cell = '';
          break;
        default:
          break;
      }
      if (!t.selfClosing) stack.push({ name, attrs, dropped: false });
      continue;
    }
    // close: unwind to the matching open tag, releasing any dropped scopes on the way
    const openIdx = stack.map((s) => s.name).lastIndexOf(name);
    if (openIdx < 0) continue;
    const unwound = stack.splice(openIdx);
    for (const u of unwound) if (u.dropped) dropDepth--;
    const opened = unwound[0]!;
    if (opened.dropped || dropDepth) continue;
    switch (name) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': case 'p': case 'div': case 'section': case 'article': case 'main': case 'blockquote': case 'li':
        flush();
        break;
      case 'ul': case 'ol':
        flush();
        listStack.pop();
        break;
      case 'pre':
      case 'textarea':
        write('\n```');
        flush();
        pre = false;
        break;
      case 'code':
        if (!pre) write('`');
        break;
      case 'b': case 'strong':
        write('**');
        break;
      case 'i': case 'em':
        write('*');
        break;
      case 'a': {
        const href = opened?.attrs.href;
        write(href ? `](${abs(href)})` : ']');
        break;
      }
      case 'span':
        write(' '); // inline chips (price, category, badges) must not run together
        break;
      case 'th': case 'td':
        row?.push(cell.replace(/\s+/g, ' ').trim());
        cell = '';
        break;
      case 'tr':
        if (row && table) {
          if (headerRow && table.length === 0) table.push(row, row.map(() => '---'));
          else table.push(row);
        }
        row = null;
        break;
      case 'table':
        if (table && table.length) {
          const width = Math.max(...table.map((r) => r.length));
          const rows = table.map((r) => [...r, ...Array(width - r.length).fill('')]);
          if (!(rows[1] && rows[1].every((c) => c === '---'))) rows.splice(1, 0, rows[0]!.map(() => '---'));
          out.push(rows.map((r) => `| ${r.join(' | ')} |`).join('\n'));
        }
        table = null;
        break;
      default:
        break;
    }
  }
  flush();
  let md = out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (title && !/^# /m.test(md)) md = `# ${decodeEntities(title)}\n\n${md}`;
  return md + '\n';
}

/** True when the client prefers markdown: `Accept` lists text/markdown with a q-value at least as high as text/html's. */
export function prefersMarkdown(accept: string | undefined | null): boolean {
  if (!accept) return false;
  let md = -1;
  let html = -1;
  for (const part of accept.split(',')) {
    const [type, ...params] = part.trim().split(';');
    const q = Number(params.map((p) => p.trim()).find((p) => p.startsWith('q='))?.slice(2) ?? '1');
    if (Number.isNaN(q)) continue;
    if (type === 'text/markdown') md = Math.max(md, q);
    if (type === 'text/html') html = Math.max(html, q);
  }
  return md > 0 && md >= html;
}

/** Rough token count for the x-markdown-tokens header (about four characters per token). */
export const approxTokens = (s: string) => Math.ceil(s.length / 4);
