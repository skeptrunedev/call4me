// Must stay the first import: see zod-first.ts.
import './zod-first';
import { Hono } from 'hono';
import { canonicalRedirect, type AppEnv } from './lib/context';
import { hmacHex, safeEqual } from './lib/keys';
import { mcp } from './routes/mcp';
import { pub } from './routes/public';
import { authRoutes } from './routes/auth';
import { mountAuth, sessionAccount } from './lib/auth';
import { webhooks } from './routes/webhooks';
import { og } from './routes/og';
import { MessagePage } from './views/public';
import { sessionFor } from './voice/session';

export { CallSession } from './voice/session';

const app = new Hono<AppEnv>();

// Pages answer on the canonical host; workers.dev and legacy hosts redirect there.
app.use('*', async (c, next) => {
  const to = canonicalRedirect(new URL(c.req.url), c.env);
  if (to) return c.redirect(to, 301);
  await next();
});

app.get('/static/*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.get('/favicon.svg', (c) => c.env.ASSETS.fetch(c.req.raw));
// Link-preview cards (lib/pages.ts).
app.route('/og', og);

// Telnyx's media stream for a call. The path carries an HMAC of the call id, so only the
// URL we handed Telnyx when dialing can attach audio to a call.
app.get('/voice/stream/:callId/:sig', async (c) => {
  const { callId, sig } = c.req.param();
  if (!safeEqual(sig, await hmacHex(c.env.STREAM_SECRET, callId))) return c.text('forbidden', 403);
  return sessionFor(c.env, callId).fetch(new Request('https://session/stream', c.req.raw));
});

app.route('/webhooks', webhooks);
// better-auth's endpoints and the OAuth discovery documents need no account.
mountAuth(app);

// The MCP endpoint authenticates each request itself (OAuth token or key), not by cookie.
app.route('/mcp', mcp);

app.use('*', async (c, next) => {
  c.set('account', await sessionAccount(c));
  await next();
});

app.route('/', authRoutes);
app.route('/', pub);

app.notFound((c) => c.html(<MessagePage title="not found" message="that page does not exist." signedIn={Boolean(c.get('account'))} />, 404));

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.html(<MessagePage title="something broke" message="try again in a moment." />, 500);
});

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
