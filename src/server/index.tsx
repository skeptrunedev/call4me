import { Hono } from 'hono';
import type { AppEnv } from './lib/context';
import { hmacHex, safeEqual } from './lib/keys';
import { mcp } from './routes/mcp';
import { accountFromCookie, pub } from './routes/public';
import { webhooks } from './routes/webhooks';
import { MessagePage } from './views/public';
import { sessionFor } from './voice/session';

export { CallSession } from './voice/session';

const app = new Hono<AppEnv>();

// Everything answers on the canonical host; workers.dev redirects there.
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const canonical = c.env.CANONICAL_HOST;
  if (canonical && url.hostname !== canonical && url.hostname !== 'localhost') {
    url.hostname = canonical;
    url.protocol = 'https:';
    url.port = '';
    return c.redirect(url.toString(), 301);
  }
  await next();
});

app.get('/static/*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.get('/favicon.svg', (c) => c.env.ASSETS.fetch(c.req.raw));

// Telnyx's media stream for a call. The path carries an HMAC of the call id, so only the
// URL we handed Telnyx when dialing can attach audio to a call.
app.get('/voice/stream/:callId/:sig', async (c) => {
  const { callId, sig } = c.req.param();
  if (!safeEqual(sig, await hmacHex(c.env.STREAM_SECRET, callId))) return c.text('forbidden', 403);
  return sessionFor(c.env, callId).fetch(new Request('https://session/stream', c.req.raw));
});

app.route('/webhooks', webhooks);

app.use('*', async (c, next) => {
  c.set('account', await accountFromCookie(c));
  await next();
});

app.route('/mcp', mcp);
app.route('/', pub);

app.notFound((c) => c.html(<MessagePage title="not found" message="that page does not exist." signedIn={Boolean(c.get('account'))} />, 404));

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.html(<MessagePage title="something broke" message="try again in a moment." />, 500);
});

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
