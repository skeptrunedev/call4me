import { Hono } from 'hono';
import { isAdmin } from '../lib/auth';
import { origin, type AppContext, type AppEnv } from '../lib/context';
import { messengerFor } from '../lib/messaging';
import { blog as blogService } from '../services/blog';
import { BlogAdmin } from '../views/blog';
import { MessagePage } from '../views/public';
import { posts } from './blog';

/** The blog's back office (ported from skillbay's /admin/blog): mail a post to subscribers once, remove comments. ADMIN_EMAILS only. */
export const admin = new Hono<AppEnv>();

admin.use('*', async (c, next) => {
  const account = c.get('account');
  if (!account) return c.redirect(`/login?next=${encodeURIComponent(c.req.path)}`, 303);
  if (!(await isAdmin(c.env, account))) return c.html(<MessagePage title="not found" message="that page does not exist." signedIn />, 404);
  await next();
});

const blogOf = (c: AppContext) => blogService(c.env.DB, messengerFor(c.env), c.env.APP_NAME, origin(c));

admin.get('/blog', async (c) => {
  const b = blogOf(c);
  const [sends, subscribers, comments] = await Promise.all([b.sends(), b.subscriberCount(), b.allComments()]);
  return c.html(<BlogAdmin posts={posts()} sends={new Map(sends.map((s) => [s.post_slug, s]))} subscribers={subscribers} comments={comments} flash={c.req.query('flash')} />);
});

admin.post('/blog/:slug/send', async (c) => {
  const post = posts().find((p) => p.slug === c.req.param('slug'));
  if (!post) return c.notFound();
  const sent = await blogOf(c).send(post);
  return c.redirect(`/admin/blog?flash=${encodeURIComponent(`sent "${post.title}" to ${sent} subscribers.`)}`, 303);
});

admin.post('/blog/comments/:id/remove', async (c) => {
  await blogOf(c).removeComment(c.req.param('id'));
  return c.redirect(`/admin/blog?flash=${encodeURIComponent('comment removed.')}`, 303);
});
