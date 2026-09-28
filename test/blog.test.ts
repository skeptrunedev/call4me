import { describe, expect, it } from 'vitest';
import { POST_SOURCES } from '../src/content/blog/index';
import { archive, atomFeed, parseFrontmatter, related, renderAll, renderPost, searchPosts } from '../src/server/lib/blog';
import { llmsTxt, sitemapXml } from '../src/server/lib/discovery';
import { validateComment } from '../src/server/services/blog';
import { isSupporterObject, SUPPORTER_METADATA } from '../src/server/services/supporters';
import dentist from './fixtures/blog/calling-the-dentist.md';
import reloads from './fixtures/blog/reloads-and-supporters.md';

const SITE = 'https://call4.me';
const FIXTURES = [
  { slug: 'calling-the-dentist', markdown: dentist },
  { slug: 'reloads-and-supporters', markdown: reloads },
];

const src = (extra = '', body = 'Intro.\n\n## First section\n\ntext\n\n## First section\n\nmore') => ({ slug: 'x', markdown: `---\ntitle: Hello, world\nsubtitle: A test post.\ndate: 2026-09-16\ntags: a, b\n${extra}---\n\n${body}` });

describe('blog', () => {
  it('parses frontmatter and renders headings with ids, captions, and footnotes', () => {
    const post = renderPost(src('', 'Intro[^1].\n\n![a chart](/static/x.svg "the caption")\n\n## First section\n\ntext\n\n## First section\n\nmore\n\n[^1]: the note'));
    expect(post.title).toBe('Hello, world');
    expect(post.subtitle).toBe('A test post.');
    expect(post.description).toBe('A test post.');
    expect(post.tags).toEqual(['a', 'b']);
    expect(post.authors[0]!.key).toBe('nick');
    expect(post.image).toBe('/static/blog/x.svg');
    expect(post.sections).toEqual([{ id: 'first-section', text: 'First section' }, { id: 'first-section-2', text: 'First section' }]);
    expect(post.html).toContain('<h2 id="first-section">');
    expect(post.html).toContain('<figcaption>the caption</figcaption>');
    expect(post.html).toContain('footnote');
    expect(post.paid).toBe(false);
    expect(parseFrontmatter('no frontmatter').meta).toEqual({});
  });
  it('splits paid posts at the paywall marker, keeping numbering continuous', () => {
    const post = renderPost(src('paid: true\n', 'free part\n\n## One\n\n<!-- paywall -->\n\n## Two\n\npaid part'));
    expect(post.paid).toBe(true);
    expect(post.html).toContain('free part');
    expect(post.html).not.toContain('paid part');
    expect(post.paidHtml).toContain('paid part');
    expect(post.paidHtml).toContain('<h2 id="two">');
    expect(post.body).not.toContain('paid part');
  });
  it('rejects posts without the required frontmatter, with unknown authors, or with slugs the routes own', () => {
    expect(() => renderPost({ slug: 'x', markdown: '---\ntitle: t\n---\nbody' })).toThrow(/date/);
    expect(() => renderPost({ slug: 'x', markdown: '---\ntitle: t\ndate: 2026-01-01\n---\nbody' })).toThrow(/subtitle/);
    expect(() => renderPost(src('authors: nobody\n'))).toThrow(/unknown author/);
    for (const slug of ['archive', 'feed.xml', 'support', 'Bad_Slug']) expect(() => renderAll([{ ...src(), slug }]), slug).toThrow(/slug/);
    expect(() => renderAll([src(), src()])).toThrow(/duplicate/);
  });
  it('ships with no posts, and the feed, sitemap, llms.txt, and archive all work with none', () => {
    const posts = renderAll(POST_SOURCES);
    expect(posts).toEqual([]);
    const feed = atomFeed(SITE, posts);
    expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(feed).toContain(`<link href="${SITE}/blog/feed.xml" rel="self" type="application/atom+xml"/>`);
    expect(feed).toMatch(/<updated>\d{4}-\d{2}-\d{2}T/);
    expect(feed).not.toContain('<entry>');
    expect(archive(posts)).toEqual([]);
    expect(sitemapXml(SITE, posts)).toContain(`<loc>${SITE}/blog</loc>`);
    expect(llmsTxt(SITE, 25, posts)).toContain(`- [Blog](${SITE}/blog)`);
  });
  it('renders fixture posts newest first with images, a feed, sitemap and llms.txt entries', () => {
    const posts = renderAll(FIXTURES);
    expect(posts.map((p) => p.slug)).toEqual(['calling-the-dentist', 'reloads-and-supporters']);
    for (const p of posts) {
      expect(p.subtitle.length).toBeGreaterThan(40);
      expect(p.description.length).toBeLessThan(320);
      expect(p.image).toMatch(/^\/static\/blog\/.+\.svg$/);
      expect(p.html).not.toContain('undefined');
    }
    const paid = posts[1]!;
    expect(paid.paid).toBe(true);
    expect(paid.description).toBe('A paid fixture post for the blog tests.');
    const feed = atomFeed(SITE, posts);
    expect(feed.match(/<entry>/g)?.length).toBe(posts.length);
    expect(feed).not.toContain('The paid part');
    expect(feed).toContain('<updated>2026-09-20T00:00:00Z</updated>');
    expect(archive(posts).map((g) => g.month)).toEqual(['September 2026', 'August 2026']);
    const sitemap = sitemapXml(SITE, posts);
    expect(sitemap).toContain(`<url><loc>${SITE}/blog/reloads-and-supporters</loc><lastmod>2026-09-01T00:00:00Z</lastmod>`);
    expect(llmsTxt(SITE, 25, posts)).toContain(`  - [Calling the dentist, test fixture](${SITE}/blog/calling-the-dentist): `);
  });
  it('finds related posts by shared tags and searches by words', () => {
    const posts = renderAll(FIXTURES);
    const paid = posts.find((p) => p.paid)!;
    expect(related(paid, posts).map((p) => p.slug)).toEqual(['calling-the-dentist']);
    expect(searchPosts(posts, 'stripe')[0]!.slug).toBe(paid.slug);
    expect(searchPosts(posts, 'zzzz-nothing')).toEqual([]);
    expect(searchPosts(posts, '')).toEqual(posts);
  });
});

describe('comments', () => {
  it('validates name, email, body, and link count', () => {
    expect(validateComment({ name: ' Jo ', email: 'JO@x.io', body: 'nice post' })).toEqual({ name: 'Jo', email: 'jo@x.io', body: 'nice post' });
    expect(() => validateComment({ name: 'J', email: 'jo@x.io', body: 'nice post' })).toThrow(/name/);
    expect(() => validateComment({ name: 'Jo', email: 'jo', body: 'nice post' })).toThrow(/email/);
    expect(() => validateComment({ name: 'Jo', email: 'jo@x.io', body: 'http://a.b http://c.d http://e.f spam' })).toThrow(/links/);
  });
});

describe('supporter tier on a shared Stripe account', () => {
  it('tags its Stripe objects so neither credit reloads nor skillbay mistake them for their own', () => {
    const meta = SUPPORTER_METADATA('acct1');
    expect(meta).toEqual({ app: 'callbay', kind: 'supporter', account_id: 'acct1' });
    // skillbay's webhook claims sessions with client_reference_id and subscriptions with metadata.user_id.
    expect(Object.keys(meta)).not.toContain('user_id');
    expect(isSupporterObject(meta)).toBe(true);
  });
  it('ignores credit reloads and skillbay supporters', () => {
    expect(isSupporterObject({ app: 'callbay', topup_id: 't1' })).toBe(false);
    expect(isSupporterObject({ kind: 'supporter', user_id: 'u1' })).toBe(false);
    expect(isSupporterObject(null)).toBe(false);
    expect(isSupporterObject(undefined)).toBe(false);
  });
});
