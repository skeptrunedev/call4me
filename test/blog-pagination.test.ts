import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/server/lib/context';
import { BLOG_PAGE_SIZE, blogIndexPath, paginatePosts } from '../src/server/lib/blog-pagination';
import { searchPosts } from '../src/server/lib/blog';
import { d1 } from './sqlite-d1';

// Use the same Markdown sources as the Worker, whose bundler loads them as text.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent('export class DurableObject {}')}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.md')) return { format: 'module', source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))}`, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { blog, posts } = await import('../src/server/routes/blog');
const app = new Hono<AppEnv>().route('/blog', blog);
const request = (path: string) => app.request(`https://call4.me${path}`, { headers: { 'user-agent': 'Googlebot' } });
const cardLinks = (html: string) => [...html.matchAll(/href="(\/blog\/[^"]+)" class="card-title"/g)].map(match => match[1]);

test('blog pagination reaches each published post once and bounds cards and structured data', async () => {
  const all = posts();
  const seen: string[] = [];
  const totalPages = Math.ceil(all.length / BLOG_PAGE_SIZE);
  for (let page = 1; page <= totalPages; page++) {
    const response = await request(blogIndexPath({ page }));
    assert.equal(response.status, 200);
    const html = await response.text();
    const links = cardLinks(html);
    assert.deepEqual(links, all.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE).map(post => `/blog/${post.slug}`));
    assert.ok(links.length <= BLOG_PAGE_SIZE);
    seen.push(...links);
    const metadata = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);
    assert.deepEqual(metadata.blogPost.map((p: { url: string }) => new URL(p.url).pathname), links);
    assert.ok(html.includes(`<link rel="canonical" href="https://call4.me${blogIndexPath({ page })}"`));
    assert.equal(html.includes('class="featured-row"'), page === 1);
    assert.equal(html.includes('rel="prev"'), page > 1);
    assert.equal(html.includes('rel="next"'), page < totalPages);
  }
  assert.equal(new Set(seen).size, all.length);
});

test('search preserves its query and result count across pages and empty results have no pager', async () => {
  const q = 'call';
  const matching = searchPosts(posts(), q);
  assert.ok(matching.length > BLOG_PAGE_SIZE);
  const html = await (await request(blogIndexPath({ q, tab: 'top', page: 2 }))).text();
  assert.deepEqual(cardLinks(html), matching.slice(BLOG_PAGE_SIZE, BLOG_PAGE_SIZE * 2).map(p => `/blog/${p.slug}`));
  assert.match(html, new RegExp(`${matching.length} posts matching`));
  assert.ok(html.includes('href="/blog?tab=top&amp;q=call" rel="prev"'));
  assert.ok(html.includes('href="/blog?tab=top&amp;q=call&amp;page=3" rel="next"'));
  assert.match(html, /name="robots" content="noindex,follow"/);
  const empty = await (await request('/blog?q=zzzznoresultzzzz')).text();
  assert.match(empty, /no posts match that/);
  assert.equal(cardLinks(empty).length, 0);
  assert.doesNotMatch(empty, /aria-label="blog pagination"/);
  assert.equal(blogIndexPath({ q: 'a & b', page: 2 }), '/blog?q=a+%26+b&page=2');
});

test('top sorting happens before pagination', async () => {
  const db = d1();
  const promoted = posts().at(-1)!;
  await db.prepare('INSERT INTO blog_likes (post_slug, reader, created_at) VALUES (?, ?, 0)').bind(promoted.slug, 'reader').run();
  const env = { DB: { ...db, withSession: () => db }, APP_NAME: 'call4me' } as unknown as Env;
  const response = await app.request('https://call4.me/blog?tab=top', {}, env);
  assert.equal(response.status, 200);
  assert.equal(cardLinks(await response.text())[0], `/blog/${promoted.slug}`);
});

test('invalid, redundant and out of range pages redirect without losing filters', async () => {
  for (const page of ['', '0', '-1', '1', 'abc', '1.5', '01', '9007199254740992']) {
    const response = await request(`/blog?tab=top&q=call&page=${page}`);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/blog?tab=top&q=call');
  }
  const response = await request('/blog?page=999');
  assert.equal(response.headers.get('location'), blogIndexPath({ page: Math.ceil(posts().length / BLOG_PAGE_SIZE) }));
  assert.deepEqual(paginatePosts([], '9'), { posts: [], page: 1, totalPages: 1, total: 0 });
});

test('RSS and Atom routes serve complete feeds and footer RSS is discoverable', async () => {
  const rss = await request('/blog/rss.xml');
  assert.equal(rss.status, 200);
  assert.match(rss.headers.get('content-type')!, /application\/rss\+xml/);
  assert.equal(((await rss.text()).match(/<item>/g) ?? []).length, posts().length);
  const atom = await request('/blog/feed.xml');
  assert.equal(atom.status, 200);
  assert.match(atom.headers.get('content-type')!, /application\/atom\+xml/);
  const html = await (await request('/blog')).text();
  assert.match(html, /<link rel="alternate" type="application\/rss\+xml" href="\/blog\/rss.xml"/);
  const footer = /<footer>([\s\S]*?)<\/footer>/.exec(html)![1];
  assert.match(footer, /class="rss-link" href="\/blog\/rss.xml"/);
});
