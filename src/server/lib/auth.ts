import { betterAuth } from 'better-auth';
import type { Hono } from 'hono';
import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { newId, now } from './ids';
import { authOptions, mcpResource, realEmail, siteResource } from './auth-options';
import { origin, type AppContext, type AppEnv } from './context';
import { accounts, type Account } from '../services/accounts';

/**
 * A better-auth instance per request. Module-scope construction is unreliable on
 * Workers (bindings are per-request and a cached instance can wedge if the first
 * request aborts), and construction is cheap.
 */
export function createAuth(c: AppContext) {
  const env = c.env;
  return betterAuth(
    authOptions({
      database: env.DB,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: origin(c),
      appName: env.APP_NAME,
      google: { clientId: env.GOOGLE_CLIENT_ID ?? '', clientSecret: env.GOOGLE_CLIENT_SECRET ?? '' },
      twitter: { clientId: env.X_CLIENT_ID ?? '', clientSecret: env.X_CLIENT_SECRET ?? '' },
    }),
  );
}

export function mountAuth(app: Hono<AppEnv>) {
  app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c).handler(c.req.raw));
  // The provider serves RFC 9728 / RFC 8414 / OIDC discovery under /api/auth; clients look at the site root.
  app.on(
    ['GET', 'HEAD'],
    ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/*', '/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/*', '/.well-known/openid-configuration', '/.well-known/openid-configuration/*'],
    (c) => createAuth(c).handler(c.req.raw),
  );
}

/** Copy Set-Cookie headers from a better-auth API call onto an outgoing response. */
export function withAuthCookies(res: Response, headers: Headers): Response {
  for (const cookie of headers.getSetCookie()) res.headers.append('set-cookie', cookie);
  return res;
}

const ACCOUNT_COLUMNS = `id, email, display_name, key_prefix, created_at`;

/**
 * The callbay account that belongs to a signed-in user. First sign-in adopts an account
 * made under the same (real) email before sign-in existed, or opens a new one.
 */
export async function accountForUser(db: D1Database, user: { id: string; email: string | null; name: string | null }): Promise<Account> {
  const owned = await db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE user_id = ?`).bind(user.id).first<Account>();
  if (owned) return owned;
  const email = realEmail(user.email)?.toLowerCase() ?? null;
  if (email) await db.prepare(`UPDATE accounts SET user_id = ? WHERE email = ? AND user_id IS NULL`).bind(user.id, email).run();
  // X users may share no email; their account is keyed by the placeholder better-auth assigns.
  await db
    .prepare(`INSERT OR IGNORE INTO accounts (id, email, display_name, user_id, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(newId(), email ?? (user.email ?? `${user.id}@users.invalid`).toLowerCase(), user.name, user.id, now())
    .run();
  return (await db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE user_id = ?`).bind(user.id).first<Account>())!;
}

/** The signed-in person's account (cookie session), or null. */
export async function sessionAccount(c: AppContext): Promise<Account | null> {
  const s = await createAuth(c).api.getSession({ headers: c.req.raw.headers });
  return s ? accountForUser(c.env.DB, { id: s.user.id, email: s.user.email, name: s.user.name }) : null;
}

// ---- MCP access tokens

export function bearerToken(c: AppContext): string {
  const header = c.req.header('authorization') ?? '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

export const looksLikeJwt = (token: string) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token);

/**
 * Verify an access token from our own provider for one of the given resources. Verified locally
 * against the keys in our database: the plugin's helper would fetch our JWKS over HTTP, and a
 * Worker cannot fetch itself.
 */
export async function verifyAccessToken(c: AppContext, token: string, audience: string | string[]): Promise<JWTPayload> {
  const jwks = await createAuth(c).api.getJwks();
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), { issuer: `${origin(c)}/api/auth`, audience, typ: 'at+jwt' });
  return payload;
}

export const verifyMcpToken = (c: AppContext, token: string) => verifyAccessToken(c, token, mcpResource(origin(c)));

/** Audiences the site's own endpoints honour: the site resource and the MCP server's (one token serves both). */
export const siteAudiences = (c: AppContext) => [siteResource(origin(c)), mcpResource(origin(c))];

/** The account behind a verified token's user (`sub`). */
export async function accountForToken(c: AppContext, claims: JWTPayload): Promise<Account | null> {
  if (typeof claims.sub !== 'string') return null;
  const u = await c.env.DB.prepare(`SELECT id, email, name FROM "user" WHERE id = ?`).bind(claims.sub).first<{ id: string; email: string | null; name: string | null }>();
  return u ? accountForUser(c.env.DB, u) : null;
}

/**
 * The account behind a request's Bearer credential for the site's own endpoints (GET /api):
 * an OAuth access token for the site or MCP resource, or a callbay API key. Null when there
 * is none or it does not verify.
 */
export async function bearerAccount(c: AppContext): Promise<Account | null> {
  const token = bearerToken(c);
  if (!token) return null;
  if (!looksLikeJwt(token)) return accounts(c.env.DB).byKey(token);
  try {
    return await accountForToken(c, await verifyAccessToken(c, token, siteAudiences(c)));
  } catch (err) {
    console.warn('site token rejected', String(err));
    return null;
  }
}

/** The RFC 9728 challenge: 401 + WWW-Authenticate so MCP clients start (or repeat) the OAuth flow. */
export function challenge(c: AppContext, message: string, error?: string): Response {
  const metadata = `${origin(c)}/.well-known/oauth-protected-resource/mcp`;
  const params = [`resource_metadata="${metadata}"`, ...(error ? [`error="${error}"`, `error_description="${message}"`] : [])];
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'www-authenticate': `Bearer ${params.join(', ')}` },
  });
}

/** ADMIN_EMAILS as a list: Nick's addresses, which also get an email for every signup. */
export const adminEmails = (env: Pick<Env, 'ADMIN_EMAILS'>): string[] =>
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Nick's accounts (ADMIN_EMAILS): they run the blog at /admin/blog and read paid posts. Checked
 * against the signed-in user's verified email, not the account's: an account's email can be
 * set from what a buyer typed into Checkout (services/topups.ts), which nobody verified.
 */
export async function isAdmin(env: Pick<Env, 'ADMIN_EMAILS' | 'DB'>, account: Account | null): Promise<boolean> {
  const admins = adminEmails(env);
  if (!account || admins.length === 0) return false;
  const u = await env.DB.prepare(`SELECT u.email FROM accounts a JOIN "user" u ON u.id = a.user_id WHERE a.id = ? AND u.emailVerified = 1`).bind(account.id).first<{ email: string }>();
  const email = realEmail(u?.email)?.toLowerCase();
  return Boolean(email && admins.includes(email));
}
