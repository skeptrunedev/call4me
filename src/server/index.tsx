// Must stay the first import: see zod-first.ts.
import './zod-first';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { canonicalRedirect, visitor, type AppEnv } from './lib/context';
import { directoryMcp, mcp } from './routes/mcp';
import { pub } from './routes/public';
import { authRoutes } from './routes/auth';
import { adminEmails, mountAuth, sessionAccount } from './lib/auth';
import { approxTokens, htmlToMarkdown, prefersMarkdown } from './lib/markdown';
import { webhooks } from './routes/webhooks';
import { og } from './routes/og';
import { agent } from './routes/agent';
import { a2a } from './routes/a2a';
import { apiRoot } from './routes/api-root';
import { recordings } from './routes/recordings';
import { numberRoutes } from './routes/numbers';
import { discovery } from './routes/discovery';
import { DIRECTORY_SERVERS, siteUrl } from './lib/auth-options';
import { API_CATALOG_LINK, API_CATALOG_MEDIA_TYPE, buildApiCatalog } from './lib/discovery';
import { MessagePage } from './views/public';
import { makeMessenger } from './lib/messaging';
import { runDrip } from './services/drip';
import { numbers } from './services/numbers';
import { notifySignups } from './services/signups';
import { submitIndexNow } from './services/indexnow';
import { sitemapEntries } from './lib/discovery';
import { blog, posts } from './routes/blog';
import { admin } from './routes/admin';
import { BlogError } from './services/blog';
import { exampleAudio } from './lib/example-audio';
import { analytics, emailHashOf } from './services/analytics';

const app = new Hono<AppEnv>();

// Lets the page layout read the signed-in account (GA's user_id, Meta's external_id) and the Pixel id without every page passing them.
app.use('*', contextStorage());

// Pages answer on the canonical host; workers.dev and legacy hosts redirect there.
app.use('*', async (c, next) => {
  const to = canonicalRedirect(new URL(c.req.url), c.env);
  if (to) return c.redirect(to, 301);
  await next();
});

// The asset binding returns complete files. Supply ranges for the reviewed audio only:
// the example calls (also embedded in blog posts), the voice samples, and the other blog recordings.
for (const path of ['/static/examples/:file{[a-z0-9-]+\\.mp3}', '/static/blog/:file{[a-z0-9-]+\\.mp3}', '/static/voices/:file{[a-z-]+\\.mp3}']) {
  app.on(['GET', 'HEAD'], path, async (c) => {
    const request = new Request(c.req.raw, { method: 'GET' });
    request.headers.delete('range');
    request.headers.delete('if-range');
    return exampleAudio(c.req.raw, await c.env.ASSETS.fetch(request));
  });
}
app.get('/static/*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.get('/favicon.svg', (c) => c.env.ASSETS.fetch(c.req.raw));
// Link-preview cards (lib/pages.ts).
app.route('/og', og);

app.route('/webhooks', webhooks);
// robots.txt, sitemap, llms.txt, auth.md, agent cards, and the root-level OAuth discovery
// documents; ahead of mountAuth so the root documents are ours, not the auth plugin's.
app.route('/', agent);
app.route('/', a2a);
app.route('/', apiRoot);
app.route('/', recordings);
app.route('/', numberRoutes);
app.route('/.well-known', discovery);
// RFC 9727 API catalog, advertised from the home page's Link header (below).
app.on(['GET', 'HEAD'], '/.well-known/api-catalog', (c) =>
  c.body(JSON.stringify(buildApiCatalog(siteUrl(new URL(c.req.url).origin)), null, 2) + '\n', 200, {
    'content-type': API_CATALOG_MEDIA_TYPE,
    'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    link: API_CATALOG_LINK,
  }),
);
// better-auth's endpoints and the other OAuth discovery documents need no account.
mountAuth(app);

// Markdown for agents: a page requested with `Accept: text/markdown` comes back as markdown.
app.use('*', async (c, next) => {
  await next();
  if (c.req.method !== 'GET' || !prefersMarkdown(c.req.header('accept'))) return;
  const type = c.res.headers.get('content-type') ?? '';
  if (!type.includes('text/html') || c.res.status >= 300) return;
  const md = htmlToMarkdown(await c.res.text(), c.req.url);
  const headers = new Headers(c.res.headers);
  headers.set('content-type', 'text/markdown; charset=utf-8');
  headers.set('x-markdown-tokens', String(approxTokens(md)));
  headers.set('vary', 'Accept');
  headers.delete('content-length');
  c.res = new Response(md, { status: c.res.status, headers });
});

// The MCP endpoint authenticates each request itself (OAuth token or key), not by cookie.
app.route('/mcp', mcp);
for (const s of DIRECTORY_SERVERS) app.route(s.path, directoryMcp(s.path, s.surface));

app.use('*', async (c, next) => {
  const account = await sessionAccount(c);
  c.set('account', account);
  c.set('gaEmailHash', account ? await emailHashOf(account) : null);
  if (account) c.executionCtx.waitUntil(analytics(c.env).seen(account, visitor(c)));
  await next();
});

// Advertise the API catalog from the site root, as RFC 9727 section 3 suggests.
app.use('/', async (c, next) => {
  await next();
  c.header('link', API_CATALOG_LINK);
});

app.route('/', authRoutes);
app.route('/blog', blog);
app.route('/admin', admin);
app.route('/', pub);

app.notFound((c) => c.html(<MessagePage title="not found" message="that page does not exist." signedIn={Boolean(c.get('account'))} />, 404));

app.onError((err, c) => {
  // The blog's own refusals (no such post, a used link, already a supporter) are shown as they are.
  if (err instanceof BlogError) return c.html(<MessagePage title={err.status === 404 ? 'not found' : 'that did not work'} message={err.message} signedIn={Boolean(c.get('account'))} />, err.status);
  console.error('unhandled', err);
  return c.html(<MessagePage title="something broke" message="try again in a moment." />, 500);
});

export default {
  fetch: app.fetch,
  // Number renewals (services/numbers.ts), signup notices, IndexNow pings for new or changed pages
  // (services/indexnow.ts), and the signup drip (services/drip.ts), which is off while DRIP_START is empty.
  async scheduled(_event, env, ctx) {
    const n = numbers(env);
    ctx.waitUntil(n.renewDue().then((r) => console.log('number renewals', JSON.stringify(r))));
    ctx.waitUntil(n.refreshOffers().then((r) => console.log('number offers', JSON.stringify(r))));
    const origin = `https://${env.CANONICAL_HOST}`;
    const messenger = makeMessenger(env);
    ctx.waitUntil(notifySignups({ db: env.DB, messenger, to: adminEmails(env), origin }).then((r) => console.log('signup notices', JSON.stringify(r))));
    if (env.INDEXNOW_KEY) {
      ctx.waitUntil(submitIndexNow({ db: env.DB, site: origin, key: env.INDEXNOW_KEY, entries: sitemapEntries(origin, posts()) }).then((r) => console.log('indexnow', JSON.stringify(r))));
    }
    const start = Number(env.DRIP_START);
    if (!env.DRIP_START || !Number.isFinite(start)) return;
    ctx.waitUntil(runDrip({ db: env.DB, messenger, origin, secret: env.BETTER_AUTH_SECRET, start }).then((r) => console.log('drip', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
