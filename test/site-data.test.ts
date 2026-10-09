import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { Hono } from 'hono';
import { jsx } from 'hono/jsx';
import type { AppEnv } from '../src/server/lib/context';
import type { Account } from '../src/server/services/accounts';
import { StaticRenderContext } from '../src/server/lib/static-render';
import { renderPost } from '../src/server/lib/blog';
import { BlogPost } from '../src/server/views/blog';
import { d1 } from './sqlite-d1';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.md')) return { format: 'module', source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))}`, shortCircuit: true };
    return next(url, context);
  },
});
const { siteData } = await import('../src/server/routes/site-data');
const slug = 'customer-story-flight-credit';
const reader = 'a'.repeat(32);

function fixture(account: Account | null = null) {
  const db = d1();
  const bookmarks: string[] = [];
  db.withSession = ((bookmark: string) => { bookmarks.push(bookmark); return db; }) as D1Database['withSession'];
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => { c.set('account', account); await next(); });
  app.route('/api/site-data', siteData);
  app.route('/blog/site-data', siteData);
  return { db, bookmarks, app, env: { DB: db, APP_NAME: 'test', STRIPE_SECRET_KEY: 'sk_test_not_a_real_key' } as Env };
}

test('live blog fragments escape comments and never expose private database fields', async () => {
  const { app, db, env, bookmarks } = fixture();
  await db.prepare('INSERT INTO blog_likes VALUES (?, ?, ?)').bind(slug, reader, 0).run();
  await db.prepare('INSERT INTO blog_comments (id,post_slug,name,email,body,status,ip,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind('comment_test', slug, '<img src=x onerror=alert(1)>', 'secret@example.com', '<script>alert(1)</script>', 'live', '192.0.2.1', 0).run();
  await db.prepare('INSERT INTO blog_comments (id,post_slug,name,email,body,status,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind('removed_test', slug, 'removed', 'removed@example.com', 'removed body', 'removed', 0).run();
  const response = await app.request(`https://call4.me/blog/site-data?post=${slug}`, { headers: { cookie: `cb_reader=${reader}; cb_d1=12345678-abcd` } }, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.signedIn, false);
  assert.equal(body.post.liked, true);
  assert.deepEqual(body.engagement[slug], { likes: 1, comments: 1 });
  assert.ok(body.post.commentsHtml.includes('&lt;script&gt;'));
  assert.ok(!body.post.commentsHtml.includes('<script>'));
  for (const value of ['secret@example.com', '192.0.2.1', 'removed body', 'removed@example.com']) assert.ok(!JSON.stringify(body).includes(value));
  assert.deepEqual(bookmarks, ['12345678-abcd']);
  assert.equal(response.headers.get('set-cookie'), null, 'read does not create a reader or alter cookies');
});

test('general live data reads country availability and does not query blog tables', async () => {
  const { app, db, env } = fixture();
  await db.prepare('INSERT INTO number_offers(country,available,checked_at) VALUES (?,?,?)').bind('US', 1, 0).run();
  await db.prepare('INSERT INTO number_offers(country,available,checked_at) VALUES (?,?,?)').bind('CA', 0, 0).run();
  const response = await app.request('https://call4.me/api/site-data', {}, env);
  assert.deepEqual(await response.json(), { signedIn: false, callCount: 0, availableCountries: 1 });
});

test('signed in supporters expose only viewer booleans, never account or billing details', async () => {
  const { app, db, env } = fixture({ id: 'acct_alice', email: 'alice@example.com', key_prefix: 'cb_live_private' } as Account);
  const time = Date.now();
  await db.prepare('INSERT INTO supporters VALUES (?,?,?,?,?,?,?,?)').bind('acct_alice', 'cus_private', 'sub_private', 'active', time + 86400000, time, time, time).run();
  const response = await app.request(`https://call4.me/blog/site-data?post=${slug}`, {}, env);
  const body = await response.json();
  assert.equal(body.signedIn, true);
  assert.equal(body.post.supporter, true);
  for (const value of ['alice@example.com', 'acct_alice', 'cb_live_private', 'cus_private', 'sub_private']) assert.ok(!JSON.stringify(body).includes(value));
});

test('static posts show loading comments and a native dynamic fallback without paid content', () => {
  const post = renderPost({ slug: 'private-test', markdown: '---\ntitle: Private test\nsubtitle: A private post\ndate: 2026-10-09\npaid: true\n---\nPublic paragraph\n<!-- paywall -->\nSecret paid paragraph' });
  const html = String(jsx(StaticRenderContext.Provider, { value: { metaPixelId: '', metaDomainVerification: '', redditPixelId: '' }, children: jsx(BlogPost, {
    signedIn: false, supporter: false, post, older: null, newer: null, related: [], engagement: { likes: 0, comments: 0 }, liked: false, comments: [], subscribers: 0, unlocked: false, agentPrompt: '',
  }) }));
  assert.ok(html.includes('loading comments'));
  assert.ok(html.includes('loading likes'));
  assert.ok(html.includes('/blog/private-test?live=1#comments'));
  assert.ok(!html.includes('Secret paid paragraph'));
  assert.ok(!html.includes('>0 comments<'));
});

test('unknown posts and database failures return explicit uncached errors', async (t) => {
  const { app, env } = fixture();
  const unknown = await app.request('https://call4.me/blog/site-data?post=not-a-post', {}, env);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get('cache-control'), 'private, no-store');
  t.mock.method(console, 'error', () => {});
  env.DB.withSession = () => { throw new Error('database offline'); };
  const failed = await app.request('https://call4.me/api/site-data', {}, env);
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await failed.json(), { error: 'Live information could not be loaded. Please retry.' });
});
