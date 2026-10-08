import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { renderPost } from '../src/server/lib/blog';
import { BlogIndex, BlogPost } from '../src/server/views/blog';
import { LoginPage } from '../src/server/views/account';
import { HomePage, PrivacyPage, RulesPage, SupportPage } from '../src/server/views/public';

const links = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));

test('transactional pages and blog query variants are noindex, while the canonical blog is indexable', () => {
  assert.match(String(LoginPage({ next: '/', providers: { google: true, x: true } })), /<meta name="robots" content="noindex,follow"\/>/);
  const props = { signedIn: false, posts: [], page: 1, totalPages: 1, total: 0, engagement: new Map(), subscribers: 0, agentPrompt: '' };
  assert.doesNotMatch(String(BlogIndex({ ...props, tab: 'latest', q: '' })), /name="robots"/);
  assert.match(String(BlogIndex({ ...props, tab: 'latest', q: 'dentist' })), /<meta name="robots" content="noindex,follow"\/>/);
  assert.match(String(BlogIndex({ ...props, tab: 'top', q: '' })), /<meta name="robots" content="noindex,follow"\/>/);
});

test('published posts stay within Ahrefs title and meta-description limits', () => {
  const dir = new URL('../src/content/blog/', import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.md'))) {
    const post = renderPost({ slug: file.slice(0, -3), markdown: readFileSync(new URL(file, dir), 'utf8') });
    assert.ok(`${post.seoTitle} - call4me`.length <= 60, `${file}: title is too long`);
    assert.ok(post.description.length >= 80, `${file}: description is too short`);
    assert.ok(post.description.length <= 160, `${file}: description is too long`);
  }
});

test('blog section labels display punctuation once and keep encoded markup as text', () => {
  const post = renderPost({
    slug: 'section-labels',
    markdown: `---\ntitle: Section labels\ndate: 2026-10-06\nsubtitle: Test\n---\n## What Aquasana's **policy** says\n\n## Returns & refunds\n\n## Literal &lt;img src=x onerror=alert(1)&gt;`,
  });
  assert.deepEqual(post.sections.map((s) => s.text), [
    "What Aquasana's policy says", 'Returns & refunds', 'Literal <img src=x onerror=alert(1)>',
  ]);
  const page = String(BlogPost({ signedIn: false, supporter: false, post, older: null, newer: null, related: [], engagement: { likes: 0, comments: 0 }, liked: false, comments: [], subscribers: 0, unlocked: false, agentPrompt: '' }));
  const toc = page.match(/<nav class="toc small"[^>]*>([\s\S]*?)<\/nav>/)![1]!;
  assert.ok(!toc.includes('&amp;#39;'));
  assert.ok(!toc.includes('&amp;amp;'));
  assert.ok(toc.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!toc.includes('<img'));
  for (const section of post.sections) {
    assert.ok(toc.includes(`href="#${section.id}"`));
    assert.ok(post.html.includes(`id="${section.id}"`));
  }
});

test('public account links go straight to sign-in for visitors and to the account for members', () => {
  for (const signedIn of [false, true]) {
    const props = { signedIn, agentPrompt: '', countries: [], pricePerMinuteCents: 25 };
    const pages = [
      HomePage({ ...props, origin: 'https://call4.me', installPrompt: '' }),
      RulesPage(props), PrivacyPage(props), SupportPage(props),
    ];
    for (const page of pages) {
      const targets = links(String(page));
      assert.ok(targets.includes(signedIn ? '/account' : '/login?next=/account'));
      if (!signedIn) assert.ok(!targets.includes('/account'), 'anonymous account links should skip the redirect');
    }
  }
});

test('supporter links preserve checkout and the return page through sign-in, including paid posts', () => {
  const post = renderPost({ slug: 'paid-example', markdown: '---\ntitle: Example\ndate: 2026-10-04\nsubtitle: Example article\npaid: true\n---\nPreview\n<!-- paywall -->\nPaid text' });
  for (const signedIn of [false, true]) {
    const pages = [
      { node: BlogIndex({ signedIn, posts: [], page: 1, totalPages: 1, total: 0, engagement: new Map(), tab: 'latest', q: '', subscribers: 0, agentPrompt: '' }), next: '/blog' },
      { node: BlogPost({ signedIn, supporter: false, post, older: null, newer: null, related: [], engagement: { likes: 0, comments: 0 }, liked: false, comments: [], subscribers: 0, unlocked: false, agentPrompt: '' }), next: '/blog/paid-example' },
    ];
    for (const { node, next } of pages) {
      const targets = links(String(node));
      const support = targets.filter((href) => decodeURIComponent(href).includes('/blog/support'));
      assert.ok(support.length > 0);
      for (const href of support) {
        let target = new URL(href, 'https://call4.me');
        if (!signedIn) {
          assert.equal(target.pathname, '/login');
          target = new URL(target.searchParams.get('next')!, target);
        }
        assert.equal(target.pathname, '/blog/support');
        assert.equal(target.searchParams.get('next'), next);
      }
    }
  }
});

test('published Markdown does not turn protected account pages or example MCP keys into redirect links', () => {
  const dir = new URL('../src/content/blog/', import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.md'))) {
    const post = renderPost({ slug: file.slice(0, -3), markdown: readFileSync(new URL(file, dir), 'utf8') });
    for (const href of links(post.html + post.paidHtml)) {
      const target = new URL(href, 'https://call4.me');
      if (target.origin !== 'https://call4.me') continue;
      assert.notEqual(target.pathname, '/account', file);
      assert.notEqual(target.pathname, '/mcp/YOUR-KEY', file);
    }
  }
});
