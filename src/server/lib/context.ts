import type { Context } from 'hono';
import type Stripe from 'stripe';
import type { Account } from '../services/accounts';
import { makeStripe } from '../services/topups';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** The account behind the session cookie, if any. */
    account: Account | null;
  };
};

export type AppContext = Context<AppEnv>;

export const origin = (c: AppContext) => new URL(c.req.url).origin;

/** Hosts callbay used to live on (LEGACY_HOSTS in wrangler.jsonc). */
export const legacyHosts = (env: Pick<Env, 'LEGACY_HOSTS'>): string[] =>
  (env.LEGACY_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

/**
 * Machine endpoints that keep answering on a legacy host: MCP clients, OAuth (tokens are
 * bound to the issuer origin they were minted on, and a sign-in started there must finish
 * there), provider webhooks, and call audio. None of these follow redirects.
 */
const LEGACY_PASSTHROUGH = ['/mcp', '/api/', '/.well-known/', '/oauth/', '/login', '/logout', '/webhooks/', '/voice/'];

/** Where a request belongs if it's on the wrong host, or null to serve it here. */
export function canonicalRedirect(url: URL, env: Pick<Env, 'CANONICAL_HOST' | 'LEGACY_HOSTS'>): string | null {
  const canonical = env.CANONICAL_HOST;
  if (!canonical || url.hostname === canonical || url.hostname === 'localhost') return null;
  if (legacyHosts(env).includes(url.hostname) && LEGACY_PASSTHROUGH.some((p) => url.pathname.startsWith(p))) return null;
  const to = new URL(url);
  to.hostname = canonical;
  to.protocol = 'https:';
  to.port = '';
  return to.toString();
}

/** Read a string form field, trimmed, with a max length. */
export function field(form: FormData, name: string, max = 10_000): string {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Stripe, built on first use: only the routes that move money need its key. */
export const stripeFor = (c: AppContext): Stripe => makeStripe(c.env.STRIPE_SECRET_KEY);

/** Only same-site relative redirects from `next` params. */
export function safeNext(next: string | undefined | null, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}
