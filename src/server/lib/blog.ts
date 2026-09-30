import { Marked, type Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import { AUTHORS, type Author } from '../../content/blog/authors';

/**
 * The blog: markdown files in src/content/blog, one per post, with YAML-ish frontmatter
 * (title, subtitle, description, date, updated, tags, authors, image, imageAlt,
 * imageCaption, paid). Rendered at request time by marked; headings get stable ids so
 * sections can be linked and cited, images with a title become captioned figures, and
 * footnotes work the GitHub way. A `<!-- paywall -->` line splits a paid post into the
 * free preview and the rest.
 */

export interface PostSource {
  slug: string;
  markdown: string;
}

export interface Post {
  slug: string;
  title: string;
  /** The dek under the title (Substack's "subtitle"); also the default description. */
  subtitle: string;
  /** One or two sentences: the meta description and the feed summary. */
  description: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  updated: string | null;
  tags: string[];
  authors: Author[];
  /** Headline image path (site-relative), its alt text, and an optional caption. */
  image: string;
  imageAlt: string;
  imageCaption: string | null;
  paid: boolean;
  /** Rendered HTML of the free part (everything for free posts). */
  html: string;
  /** Rendered HTML behind the paywall; empty for free posts. */
  paidHtml: string;
  /** The body as markdown, for feeds and Accept: text/markdown (free part only when paid). */
  body: string;
  readingMinutes: number;
  /** Section headings (h2) with their ids, for the table of contents. */
  sections: { id: string; text: string }[];
}

export const PAYWALL = '<!-- paywall -->';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function parseFrontmatter(markdown: string): { meta: Record<string, string>; body: string } {
  const text = markdown.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!] = kv[2]!.trim().replace(/^["'](.*)["']$/, '$1');
  }
  return { meta, body: m[2]! };
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function renderer(sections: { id: string; text: string }[]) {
  const seen = new Map<string, number>();
  return new Marked({ gfm: true }).use(markedFootnote()).use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const base = slugify(inner) || 'section';
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const id = n === 1 ? base : `${base}-${n}`;
        if (depth === 2) sections.push({ id, text: inner.replace(/<[^>]+>/g, '') });
        return `<h${depth} id="${id}">${inner} <a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a></h${depth}>\n`;
      },
      image({ href, title, text }: Tokens.Image) {
        const img = `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}" loading="lazy">`;
        return title ? `<figure>${img}<figcaption>${escapeAttr(title)}</figcaption></figure>` : img;
      },
    },
  });
}

export function renderPost(src: PostSource): Post {
  const { meta, body: full } = parseFrontmatter(src.markdown);
  if (!meta.title || !meta.date) throw new Error(`blog post ${src.slug}: frontmatter needs title and date`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`blog post ${src.slug}: date must be YYYY-MM-DD`);
  if (!meta.subtitle && !meta.description) throw new Error(`blog post ${src.slug}: frontmatter needs a subtitle or description`);
  const sections: { id: string; text: string }[] = [];
  const md = renderer(sections);
  const cut = full.indexOf(PAYWALL);
  const paid = meta.paid === 'true';
  const body = paid && cut >= 0 ? full.slice(0, cut) : full;
  const rest = paid && cut >= 0 ? full.slice(cut + PAYWALL.length) : '';
  // One parse keeps footnote numbering and heading ids continuous across the cut.
  // Plain letters only: underscores would turn into emphasis.
  const cutWord = 'PAYWALLCUTMARKERx7f3a';
  const marker = `<p>${cutWord}</p>`;
  const rendered = md.parse(rest ? `${body}\n\n${cutWord}\n\n${rest}` : body, { async: false }) as string;
  const [html, paidHtml] = rest ? rendered.split(marker) : [rendered, ''];
  const words = full.split(/\s+/).filter(Boolean).length;
  const authors = (meta.authors ?? 'nick')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => {
      const a = AUTHORS[k];
      if (!a) throw new Error(`blog post ${src.slug}: unknown author "${k}"`);
      return a;
    });
  return {
    slug: src.slug,
    title: meta.title,
    subtitle: meta.subtitle ?? meta.description!,
    description: meta.description ?? meta.subtitle!,
    date: meta.date,
    updated: meta.updated ?? null,
    tags: (meta.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    authors,
    image: meta.image ?? `/static/blog/${src.slug}.svg`,
    imageAlt: meta.imageAlt ?? meta.title,
    imageCaption: meta.imageCaption ?? null,
    paid,
    html: html ?? '',
    paidHtml: (paidHtml ?? '').trim(),
    body: body.trim(),
    readingMinutes: Math.max(1, Math.round(words / 220)),
    sections,
  };
}

/** Paths under /blog that are routes, not posts. */
const RESERVED_SLUGS = new Set(['archive', 'feed.xml', 'subscribe', 'unsubscribe', 'support']);

/** Newest first; slugs must be unique, lowercase-with-dashes, and not a /blog route. */
export function renderAll(sources: PostSource[]): Post[] {
  const posts = sources.map(renderPost).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const slugs = new Set<string>();
  for (const p of posts) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug) || RESERVED_SLUGS.has(p.slug)) throw new Error(`blog slug ${p.slug}: lowercase letters, digits and dashes, and not a /blog route`);
    if (slugs.has(p.slug)) throw new Error(`duplicate blog slug ${p.slug}`);
    slugs.add(p.slug);
  }
  return posts;
}

/** Posts sharing the most tags, newest first among ties; never the post itself. */
export function related(post: Post, all: Post[], limit = 3): Post[] {
  return all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, shared: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.shared - a.shared || (a.p.date < b.p.date ? 1 : -1))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Plain substring search over title, subtitle, tags, and body; ranked by where it hits. */
export function searchPosts(all: Post[], q: string): Post[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return all;
  return all
    .map((p) => {
      const title = `${p.title} ${p.subtitle} ${p.tags.join(' ')}`.toLowerCase();
      const body = p.body.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 10;
        else if (body.includes(w)) score += 1;
        else return { p, score: 0 };
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

/** Posts grouped by month, newest first, for the archive page. */
export function archive(all: Post[]): { month: string; posts: Post[] }[] {
  const groups = new Map<string, Post[]>();
  for (const p of all) {
    const key = new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups].map(([month, posts]) => ({ month, posts }));
}

export const postDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const shortPostDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
/** A timestamp (ms) as "2026-09-27 18:04 UTC", for comments. */
export const longDate = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Atom feed (RFC 4287) of the whole blog (free parts of paid posts). */
export function atomFeed(site: string, posts: Post[]): string {
  const updated = posts[0] ? `${posts[0].updated ?? posts[0].date}T00:00:00Z` : new Date().toISOString();
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>call4me blog</title>`,
    `  <subtitle>notes on AI agents that make phone calls for you</subtitle>`,
    `  <link href="${site}/blog/feed.xml" rel="self" type="application/atom+xml"/>`,
    `  <link href="${site}/blog" rel="alternate" type="text/html"/>`,
    `  <id>${site}/blog</id>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>Nick Khami</name><uri>https://x.com/skeptrune</uri></author>`,
    ...posts.flatMap((p) => [
      '  <entry>',
      `    <title>${xml(p.title)}</title>`,
      `    <link href="${site}/blog/${p.slug}" rel="alternate" type="text/html"/>`,
      `    <link href="${site}${p.image}" rel="enclosure" type="image/svg+xml"/>`,
      `    <id>${site}/blog/${p.slug}</id>`,
      `    <published>${p.date}T00:00:00Z</published>`,
      `    <updated>${p.updated ?? p.date}T00:00:00Z</updated>`,
      ...p.authors.map((a) => `    <author><name>${xml(a.name)}</name><uri>${a.url}</uri></author>`),
      `    <summary>${xml(p.subtitle)}</summary>`,
      `    <content type="html">${xml(p.html)}</content>`,
      ...p.tags.map((t) => `    <category term="${xml(t)}"/>`),
      '  </entry>',
    ]),
    '</feed>',
    '',
  ].join('\n');
}
