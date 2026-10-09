import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { origin, stripeFor, type AppEnv } from '../lib/context';
import { messengerFor } from '../lib/messaging';
import { blog as blogService } from '../services/blog';
import { placedCallCount } from '../services/stats';
import { supporters } from '../services/supporters';
import { BlogComments } from '../views/blog';
import { posts } from './blog';

/** Mounted under /blog as well so existing reader and D1 bookmark cookies reach it. */
export const siteData = new Hono<AppEnv>();

siteData.get('/', async (c) => {
  c.header('cache-control', 'private, no-store');
  c.header('vary', 'Cookie');
  const slug = c.req.query('post');
  const blogRequested = Boolean(slug) || c.req.path.startsWith('/blog/');
  const all = blogRequested ? posts() : [];
  if (slug !== undefined && !all.some((p) => p.slug === slug)) return c.json({ error: 'no such post' }, 404);
  const account = c.get('account');
  const bookmark = getCookie(c, 'cb_d1');
  try {
    const db = c.env.DB.withSession(bookmark && /^[0-9a-f-]{8,200}$/i.test(bookmark) ? bookmark : 'first-unconstrained');
    if (!blogRequested) {
      const [callCount, countries] = await Promise.all([
        placedCallCount(db),
        db.prepare('SELECT COUNT(*) AS total FROM number_offers WHERE available = 1').first<{ total: number }>(),
      ]);
      return c.json({ signedIn: Boolean(account), callCount, availableCountries: countries?.total ?? 0 });
    }
    const service = blogService(db, messengerFor(c.env), c.env.APP_NAME, origin(c));
    const reader = getCookie(c, 'cb_reader');
    const [count, engagement, subscribers, comments, liked, supporter] = await Promise.all([
      placedCallCount(db),
      service.engagement(all.map((p) => p.slug)),
      service.subscriberCount(),
      slug ? service.comments(slug) : [],
      slug && reader && /^[0-9a-f]{32}$/.test(reader) ? service.liked(slug, reader) : false,
      slug && account ? supporters(c.env.DB, stripeFor(c), c.env).isSupporter(account.id) : false,
    ]);
    return c.json({
      signedIn: Boolean(account),
      callCount: count,
      subscribers,
      engagement: Object.fromEntries(engagement),
      ...(slug ? { post: { slug, liked, supporter, commentsHtml: String(<BlogComments comments={comments} />) } } : {}),
    });
  } catch (error) {
    console.error('site data failed', error);
    return c.json({ error: 'Live information could not be loaded. Please retry.' }, 503);
  }
});
