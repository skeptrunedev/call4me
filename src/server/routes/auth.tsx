import { Hono } from 'hono';
import { createAuth, withAuthCookies } from '../lib/auth';
import { field, origin, safeNext, type AppContext, type AppEnv } from '../lib/context';
import { signInPrompt } from '../lib/prompts';
import { ConsentPage, EmailLinkPage, LoginPage } from '../views/account';

/** Sign-in with Google or X (better-auth), password sign-in for provisioned accounts, and the consent step of the MCP OAuth provider. */
export const authRoutes = new Hono<AppEnv>();

const providers = (c: AppContext) => ({ google: Boolean(c.env.GOOGLE_CLIENT_ID), x: Boolean(c.env.X_CLIENT_ID) });

/** What the email-link verify endpoint reports (as `?error=CODE`) when a link is spent or stale. */
const LINK_ERROR = /^[A-Z_]+$/;

authRoutes.get('/login', (c) => {
  const url = new URL(c.req.url);
  // The OAuth provider (MCP sign-in) sends people here with its signed authorize query; after
  // sign-in they continue at the authorize endpoint, which then asks for consent.
  const fromOAuth = url.searchParams.has('client_id') && url.searchParams.has('sig');
  const next = fromOAuth ? `/api/auth/oauth2/authorize?${url.search.slice(1)}` : safeNext(c.req.query('next'));
  if (c.get('account')) return c.redirect(next, 303);
  const error = c.req.query('error');
  // People signing in for an agent's OAuth flow are already mid-connect; everyone else can have their agent do it.
  return c.html(
    <LoginPage
      next={next}
      email={c.req.query('email')}
      error={error && LINK_ERROR.test(error) ? 'that sign-in link expired or was already used. get a new one below.' : error}
      providers={providers(c)}
      agentPrompt={fromOAuth ? undefined : signInPrompt(origin(c))}
    />,
  );
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

/**
 * Sign-in by emailed link, which also opens an account for a new email. Through the HTTP handler
 * rather than auth.api so better-auth's per-address rate limit guards the mailbox.
 */
authRoutes.post('/login/email', async (c) => {
  const form = await c.req.formData();
  const next = safeNext(field(form, 'next'));
  const email = field(form, 'email', 200);
  const res = await createAuth(c).handler(
    new Request(`${origin(c)}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: origin(c), 'cf-connecting-ip': c.req.header('cf-connecting-ip') ?? '' },
      body: JSON.stringify({ email, callbackURL: next, errorCallbackURL: `/login?next=${encodeURIComponent(next)}` }),
    }),
  );
  if (res.ok) return c.html(<LoginPage next={next} email={email} sent providers={providers(c)} />);
  const error = res.status === 429 ? 'too many sign-in links asked for. wait a minute and try again.' : res.status === 400 ? 'that email address does not look right.' : 'could not send the sign-in link. try again.';
  if (res.status >= 500) console.error('sign-in link failed', res.status, await res.text().catch(() => ''));
  return c.html(<LoginPage next={next} email={email} error={error} providers={providers(c)} />, res.status === 429 ? 429 : 400);
});

/** Where the emailed link lands. Verifying spends the link, so it waits for a click: mail scanners open every link. */
authRoutes.get('/login/email', (c) => {
  const url = new URL(c.req.url);
  if (!url.searchParams.get('token')) return c.redirect('/login', 302);
  return c.html(<EmailLinkPage params={[...url.searchParams]} />);
});

/** Accounts made with scripts/create-password-user.mjs; there is no password sign-up. */
authRoutes.post('/login/password', async (c) => {
  const form = await c.req.formData();
  const next = safeNext(field(form, 'next'));
  try {
    const { headers } = await createAuth(c).api.signInEmail({
      body: { email: field(form, 'email', 200), password: field(form, 'password', 200) },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    return withAuthCookies(c.redirect(next, 303), headers);
  } catch {
    return c.html(<LoginPage next={next} error="wrong email or password" providers={providers(c)} />, 401);
  }
});

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
