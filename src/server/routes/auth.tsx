import { Hono } from 'hono';
import { createAuth, withAuthCookies } from '../lib/auth';
import { field, origin, safeNext, type AppContext, type AppEnv } from '../lib/context';
import { ConsentPage, LoginPage } from '../views/account';

/** Sign-in with Google or X (better-auth), and the consent step of the MCP OAuth provider. */
export const authRoutes = new Hono<AppEnv>();

const providers = (c: AppContext) => ({ google: Boolean(c.env.GOOGLE_CLIENT_ID), x: Boolean(c.env.X_CLIENT_ID) });

authRoutes.get('/login', (c) => {
  const url = new URL(c.req.url);
  // The OAuth provider (MCP sign-in) sends people here with its signed authorize query; after
  // sign-in they continue at the authorize endpoint, which then asks for consent.
  const fromOAuth = url.searchParams.has('client_id') && url.searchParams.has('sig');
  const next = fromOAuth ? `/api/auth/oauth2/authorize?${url.search.slice(1)}` : safeNext(c.req.query('next'));
  if (c.get('account')) return c.redirect(next, 303);
  return c.html(<LoginPage next={next} error={c.req.query('error')} providers={providers(c)} />);
});

for (const [path, provider, label] of [
  ['google', 'google', 'google'],
  ['x', 'twitter', 'x'],
] as const) {
  authRoutes.post(`/login/${path}`, async (c) => {
    const next = safeNext(field(await c.req.formData(), 'next'));
    const { headers, response } = await createAuth(c).api.signInSocial({
      body: { provider, callbackURL: next, errorCallbackURL: `/login?error=${label}+sign-in+failed` },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    if (!response.url) return c.html(<LoginPage next={next} error={`${label} sign-in is not available right now`} providers={providers(c)} />, 502);
    return withAuthCookies(c.redirect(response.url, 303), headers);
  });
}

authRoutes.post('/logout', async (c) => {
  const { headers } = await createAuth(c).api.signOut({ headers: c.req.raw.headers, returnHeaders: true });
  return withAuthCookies(c.redirect('/', 303), headers);
});

// ---- OAuth consent (the provider redirects here with a signed query; we answer through its consent endpoint)

async function clientName(c: AppContext, clientId: string): Promise<string> {
  const row = await c.env.DB.prepare(`SELECT name FROM oauthClient WHERE clientId = ?`).bind(clientId).first<{ name: string | null }>();
  return row?.name || 'an MCP client';
}

authRoutes.get('/oauth/consent', async (c) => {
  const url = new URL(c.req.url);
  if (!c.get('account')) return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 303);
  return c.html(<ConsentPage client={await clientName(c, url.searchParams.get('client_id') ?? '')} query={url.search.slice(1)} />);
});

authRoutes.post('/oauth/consent', async (c) => {
  if (!c.get('account')) return c.redirect('/login', 303);
  const form = await c.req.formData();
  const query = field(form, 'oauth_query', 8000);
  const accept = field(form, 'decision', 10) === 'allow';
  // Through the HTTP handler rather than auth.api: the consent endpoint reads request-scoped
  // state that only the handler path sets up.
  const res = await createAuth(c).handler(
    new Request(`${origin(c)}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: c.req.header('cookie') ?? '', origin: origin(c) },
      body: JSON.stringify({ accept, oauth_query: query }),
    }),
  );
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string; error_description?: string; message?: string };
  if (res.ok && body.url) return c.redirect(body.url, 303);
  const message = [body.error, body.error_description ?? body.message].filter(Boolean).join(' ') || `status ${res.status}`;
  const params = new URLSearchParams(query);
  return c.html(<ConsentPage client={await clientName(c, params.get('client_id') ?? '')} query={query} error={`could not complete: ${message}. start again from your MCP client.`} />, 400);
});
