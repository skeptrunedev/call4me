import assert from 'node:assert/strict';
import test from 'node:test';
import { atomFeed, renderPost, rssFeed } from '../src/server/lib/blog';
import { decodeEntities } from '../src/server/lib/markdown';

const post = (slug: string, body: string, meta = '') => renderPost({
  slug,
  markdown: `---\ntitle: Calls & answers <today>\nsubtitle: Latest news\ndescription: Tips & updates\ndate: 2026-10-07\ntags: guides, news & updates\n${meta}---\n${body}`,
});

test('RSS preserves canonical IDs, dates, escaped metadata and complete public content', () => {
  const article = post('public-post', 'A **complete** article with a literal ]]> sequence.');
  const output = rssFeed('https://call4.me/', [article]);
  assert.match(output, /<rss version="2.0"/);
  assert.match(output, /<atom:link href="https:\/\/call4.me\/blog\/rss.xml" rel="self" type="application\/rss\+xml"\/>/);
  assert.match(output, /<title>Calls &amp; answers &lt;today&gt;<\/title>/);
  assert.match(output, /<description>Tips &amp; updates<\/description>/);
  assert.match(output, /<guid isPermaLink="true">https:\/\/call4.me\/blog\/public-post<\/guid>/);
  assert.match(output, /<pubDate>Wed, 07 Oct 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(output, /<dc:creator>Nick Khami<\/dc:creator>/);
  assert.match(output, /<category>news &amp; updates<\/category>/);
  const content = /<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(output)![1]!;
  assert.equal(decodeEntities(content), article.html);
  assert.doesNotMatch(output, /<!\[CDATA\[/);
});

test('RSS resolves article links and media for readers outside the website', () => {
  const article = post('linked-post', '## Details\n\n[Other article](/blog/other?one=1&two=2)\n\n![Photo](/static/photo.jpg)\n\n[Section](#details)\n\n<audio controls src="/recordings/call.mp3"></audio>');
  const output = rssFeed('https://call4.me', [article]);
  const content = decodeEntities(/<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(output)![1]!);
  assert.match(content, /href="https:\/\/call4.me\/blog\/other\?one=1&amp;two=2"/);
  assert.match(content, /src="https:\/\/call4.me\/static\/photo.jpg"/);
  assert.match(content, /href="https:\/\/call4.me\/blog\/linked-post#details"/);
  assert.match(content, /src="https:\/\/call4.me\/recordings\/call.mp3"/);
});

test('RSS never includes paid content and keeps stable IDs when articles change', () => {
  const article = post('paid-post', 'Public preview.\n\n<!-- paywall -->\n\nPrivate paid content.', 'paid: true\n');
  const before = rssFeed('https://call4.me', [article]);
  const after = rssFeed('https://call4.me', [{ ...article, title: 'Revised headline', updated: '2026-10-08' }]);
  assert.match(before, /Public preview/);
  assert.doesNotMatch(before, /Private paid content/);
  assert.equal(/<guid[^>]*>.*?<\/guid>/.exec(before)![0], /<guid[^>]*>.*?<\/guid>/.exec(after)![0]);
  assert.match(after, /<lastBuildDate>Thu, 08 Oct 2026 00:00:00 GMT<\/lastBuildDate>/);
  assert.match(after, /<pubDate>Wed, 07 Oct 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(atomFeed('https://call4.me', [article]), /<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
});

test('RSS build date reflects edits to older posts and an empty feed has no invented date', () => {
  const articles = [post('newer-post', 'New article.'), { ...post('older-post', 'Older article.'), date: '2026-09-30', updated: '2026-10-08' }];
  assert.match(rssFeed('https://call4.me', articles), /<lastBuildDate>Thu, 08 Oct 2026 00:00:00 GMT<\/lastBuildDate>/);
  const empty = rssFeed('https://call4.me', []);
  assert.match(empty, /<channel>/);
  assert.doesNotMatch(empty, /<item>|<lastBuildDate>|Invalid Date/);
});
