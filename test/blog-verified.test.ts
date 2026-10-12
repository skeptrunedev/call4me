import assert from 'node:assert/strict';
import test from 'node:test';
import { lastModified, renderPost } from '../src/server/lib/blog';
import { sitemapEntries } from '../src/server/lib/discovery';
import { BlogPost } from '../src/server/views/blog';

const post = (meta: string) => renderPost({
  slug: 'acme-customer-service',
  markdown: `---\ntitle: Acme customer service\ndescription: We called Acme.\ndate: 2026-10-01\n${meta}---\nCall 800-555-0100.`,
});

test('verified is optional and parsed from frontmatter', () => {
  assert.equal(post('').verified, null);
  assert.equal(post('verified: 2026-10-03\n').verified, '2026-10-03');
  assert.throws(() => post('verified: Oct 3\n'), /verified must be YYYY-MM-DD/);
  assert.throws(() => post('updated: yesterday\n'), /updated must be YYYY-MM-DD/);
});

test('last modified is the newest of published, updated and verified', () => {
  assert.equal(lastModified(post('')), '2026-10-01');
  assert.equal(lastModified(post('updated: 2026-10-05\n')), '2026-10-05');
  assert.equal(lastModified(post('verified: 2026-10-07\n')), '2026-10-07');
  assert.equal(lastModified(post('updated: 2026-10-09\nverified: 2026-10-07\n')), '2026-10-09');
  assert.equal(lastModified(post('updated: 2026-10-04\nverified: 2026-10-08\n')), '2026-10-08');
});

test('sitemap lastmod reflects a newer verification date', () => {
  const entry = sitemapEntries('https://call4.me', [post('updated: 2026-10-04\nverified: 2026-10-08\n')]).find((e) => e.loc.endsWith('/blog/acme-customer-service'));
  assert.equal(entry?.lastmod, '2026-10-08T00:00:00Z');
});

const page = (p: ReturnType<typeof post>) => String(BlogPost({ signedIn: false, supporter: false, post: p, older: null, newer: null, related: [], engagement: { likes: 0, comments: 0 }, liked: false, comments: [], subscribers: 0, unlocked: false, agentPrompt: '' }));

test('the byline shows the verification date and dateModified follows it', () => {
  const html = page(post('updated: 2026-10-04\nverified: 2026-10-08\n'));
  assert.match(html, /number verified <time datetime="2026-10-08">October 8, 2026<\/time>/);
  assert.match(html, /"dateModified":"2026-10-08"/);
  assert.doesNotMatch(page(post('updated: 2026-10-04\n')), /number verified/);
});
