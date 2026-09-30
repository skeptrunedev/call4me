import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { POST_SOURCES } from '../../content/blog/index';
import { isAdmin } from '../lib/auth';
import { archive, atomFeed, related, renderAll, searchPosts, type Post } from '../lib/blog';
import { clientIp, field, origin, safeNext, stripeFor, type AppContext, type AppEnv } from '../lib/context';
import { messengerFor } from '../lib/messaging';
import { blog as blogService, BlogError } from '../services/blog';
import { supporters } from '../services/supporters';
import { BlogArchive, BlogIndex, BlogPost, SubscribeConfirm, SubscribeResult, type Tab } from '../views/blog';

/**
 * The blog: index with tabs and search, archive, posts with likes and comments, the
 * newsletter (subscribe, confirm, unsubscribe), the supporter tier for paid posts, and an
 * Atom feed. Posts are markdown files in src/content/blog. Ported from skillbay.
 */
export const blog = new Hono<AppEnv>();

let cache: Post[] | null = null;
export const posts = (): Post[] => (cache ??= renderAll(POST_SOURCES));

const svc = (c: AppContext) => blogService(c.env.DB, messengerFor(c.env), c.env.APP_NAME, origin(c));
const supportOf = (c: AppContext) => supporters(c.env.DB, stripeFor(c), c.env);
const CACHE = { 'cache-control': 'public, max-age=600' };
const READER_COOKIE = 'cb_reader';

/** An opaque per-browser id so a like counts once. Functional only; nothing else reads it. */
function reader(c: AppContext): string {
  let id = getCookie(c, READER_COOKIE);
  if (!id || !/^[0-9a-f]{32}$/.test(id)) {
    id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    setCookie(c, READER_COOKIE, id, { path: '/blog', httpOnly: true, sameSite: 'Lax', secure: new URL(c.req.url).protocol === 'https:', maxAge: 365 * 86400 });
  }
  return id;
}

/** The signed-in reader's standing: supporters and admins read paid posts in full. */
async function standing(c: AppContext): Promise<{ signedIn: boolean; supporter: boolean; unlocked: boolean }> {
  const account = c.get('account');
  if (!account) return { signedIn: false, supporter: false, unlocked: false };
  const [supporter, admin] = await Promise.all([supportOf(c).isSupporter(account.id), isAdmin(c.env, account)]);
  return { signedIn: true, supporter, unlocked: supporter || admin };
}

blog.get('/', async (c) => {
  const all = posts();
  const tab = (['latest', 'top', 'discussions'].includes(c.req.query('tab') ?? '') ? c.req.query('tab') : 'latest') as Tab;
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  const [engagement, subscribers] = await Promise.all([svc(c).engagement(all.map((p) => p.slug)), svc(c).subscriberCount()]);
  let list = q ? searchPosts(all, q) : all;
  const score = (p: Post) => {
    const e = engagement.get(p.slug)!;
    return tab === 'top' ? e.likes * 10 + e.comments : e.comments;
  };
  if (!q && tab !== 'latest') list = [...list].sort((a, b) => score(b) - score(a) || (a.date < b.date ? 1 : -1));
  return c.html(<BlogIndex signedIn={Boolean(c.get('account'))} posts={list} all={all} engagement={engagement} tab={tab} q={q} subscribers={subscribers} subscribed={c.req.query('subscribed')} />);
});

blog.get('/archive', async (c) => {
  const all = posts();
  return c.html(<BlogArchive signedIn={Boolean(c.get('account'))} groups={archive(all)} engagement={await svc(c).engagement(all.map((p) => p.slug))} />);
});

blog.get('/feed.xml', (c) => c.body(atomFeed(origin(c), posts()), 200, { 'content-type': 'application/atom+xml; charset=utf-8', ...CACHE }));

// ---- newsletter

blog.post('/subscribe', async (c) => {
  const form = await c.req.formData();
  const email = field(form, 'email', 200);
  // Back to the page the box was on: the index or a post (a plain path, no query).
  const next = field(form, 'next', 200);
  const back = /^\/blog(\/[a-z0-9-]+)?$/.test(next) ? next : '/blog';
  try {
    await svc(c).subscribe(email, clientIp(c));
    return c.redirect(`${back}?subscribed=sent#subscribe`, 303);
  } catch (err) {
    if (err instanceof BlogError) return c.redirect(`${back}?subscribed=${encodeURIComponent(err.message)}#subscribe`, 303);
    throw err;
  }
});

// Confirm and unsubscribe links from emails: GET only shows a button, because mail scanners
// open every link in an email; the change itself is a POST (like the drip's /unsubscribe).
blog.get('/subscribe/confirm', async (c) => {
  const row = await svc(c).byToken(c.req.query('token') ?? '');
  return c.html(<SubscribeConfirm signedIn={Boolean(c.get('account'))} action="/blog/subscribe/confirm" token={row.token} title="confirm your subscription" text={`get new call4me posts at ${row.email}? one email per post, and every one has an unsubscribe link.`} button="subscribe" />);
});

blog.post('/subscribe/confirm', async (c) => {
  const row = await svc(c).confirm(field(await c.req.formData(), 'token', 100));
  return c.html(<SubscribeResult signedIn={Boolean(c.get('account'))} title="subscribed" text={`${row.email} will get new posts by email. every email has an unsubscribe link.`} />);
});

blog.get('/unsubscribe', async (c) => {
  const row = await svc(c).byToken(c.req.query('token') ?? '');
  return c.html(<SubscribeConfirm signedIn={Boolean(c.get('account'))} action="/blog/unsubscribe" token={row.token} title="unsubscribe" text={`stop sending call4me blog posts to ${row.email}?`} button="unsubscribe" />);
});

blog.post('/unsubscribe', async (c) => {
  await svc(c).unsubscribe(field(await c.req.formData(), 'token', 100));
  return c.html(<SubscribeResult signedIn={Boolean(c.get('account'))} title="unsubscribed" text="no more emails from the blog. you can subscribe again any time." />);
});

// ---- supporters (paid posts)

blog.get('/support', async (c) => {
  const next = safeNext(c.req.query('next'), '/blog');
  const account = c.get('account');
  if (!account) return c.redirect(`/login?next=${encodeURIComponent(`/blog/support?next=${next}`)}`, 303);
  if (await supportOf(c).isSupporter(account.id)) return c.redirect(next, 303);
  return c.redirect(await supportOf(c).checkout(account, origin(c), next), 303);
});

blog.get('/support/done', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect(`/login?next=${encodeURIComponent(c.req.url.slice(origin(c).length))}`, 303);
  const ok = await supportOf(c).completeSession(c.req.query('session_id') ?? '', account.id);
  const next = safeNext(c.req.query('next'), '/blog');
  return c.html(
    <SubscribeResult
      signedIn
      title={ok ? 'thank you' : 'hmm'}
      text={ok ? 'you support call4me. paid posts are open to you while the subscription runs; manage it any time from the blog.' : 'we could not confirm that checkout. if you were charged, email me@call4.me.'}
      next={next}
    />,
  );
});

blog.get('/support/manage', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/blog/support/manage', 303);
  return c.redirect(await supportOf(c).portal(account.id, origin(c)), 303);
});

// ---- posts

function find(slug: string): { post: Post; i: number; all: Post[] } {
  const all = posts();
  const i = all.findIndex((p) => p.slug === slug);
  if (i < 0) throw new BlogError('no such post', 404);
  return { post: all[i]!, i, all };
}

async function render(c: AppContext, slug: string, extra: { commentValues?: Record<string, string | undefined>; commentError?: string } = {}, status: 200 | 400 | 429 = 200) {
  const { post, i, all } = find(slug);
  const s = svc(c);
  const r = reader(c);
  const [engagement, liked, comments, subscribers, who] = await Promise.all([s.engagement([slug]), s.liked(slug, r), s.comments(slug), s.subscriberCount(), standing(c)]);
  return c.html(
    <BlogPost
      signedIn={who.signedIn}
      supporter={who.supporter}
      post={post}
      newer={all[i - 1] ?? null}
      older={all[i + 1] ?? null}
      related={related(post, all)}
      engagement={engagement.get(slug)!}
      liked={liked}
      comments={comments}
      subscribers={subscribers}
      unlocked={!post.paid || who.unlocked}
      subscribed={c.req.query('subscribed')}
      {...extra}
    />,
    status,
  );
}

blog.get('/:slug', (c) => render(c, c.req.param('slug')));

blog.post('/:slug/like', async (c) => {
  const { post } = find(c.req.param('slug'));
  await svc(c).toggleLike(post.slug, reader(c));
  return c.redirect(`/blog/${post.slug}`, 303);
});

blog.post('/:slug/comments', async (c) => {
  const { post } = find(c.req.param('slug'));
  const form = await c.req.formData();
  const values = { name: field(form, 'name', 60), email: field(form, 'email', 200), body: field(form, 'body', 5000) };
  // The hidden "website" field is a honeypot: people never see it, bots fill it.
  if (field(form, 'website', 200)) return c.redirect(`/blog/${post.slug}#comments`, 303);
  try {
    const row = await svc(c).addComment(post.slug, values, clientIp(c));
    return c.redirect(`/blog/${post.slug}#c-${row.id}`, 303);
  } catch (err) {
    if (err instanceof BlogError && (err.status === 400 || err.status === 429)) return render(c, post.slug, { commentValues: values, commentError: err.message }, err.status);
    throw err;
  }
});
