import type { Context } from 'hono';
import type Stripe from 'stripe';
import { accounts, type Account } from '../services/accounts';
import type { Visitor } from '../services/analytics';
import { firstTouchCookie } from './first-touch';
import { gaClient } from './ga';
import { metaBrowser } from './meta';
import { makeStripe } from '../services/topups';
import { redditVisitCookie } from './reddit';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** The account behind the session cookie, if any. */
    account: Account | null;
    /** The signed-in account's hashed email for GA's user-provided data (services/analytics.ts). */
    gaEmailHash: string | null;
    /** Latest paid Reddit landing known for this request. */
    redditVisitId: string | null;
  };
};

export type AppContext = Context<AppEnv>;

export const origin = (c: AppContext) => new URL(c.req.url).origin;

/**
 * An account's API key for the copy prompts on a page shown to its owner. The page then
 * carries a secret, so no shared cache may keep it.
 */
export async function ownerKey(c: AppContext, account: Account): Promise<string> {
  c.header('cache-control', 'private, no-store');
  return accounts(c.env.DB).promptKey(account.id, c.env.BETTER_AUTH_SECRET);
}

/** The signed-in viewer's key for the page's copy prompts; null signed out. */
export const viewerKey = async (c: AppContext, account = c.get('account')): Promise<string | null> => (account ? ownerKey(c, account) : null);

/** The browser behind this request, as GA and Meta identify it, and where it first came from (services/analytics.ts). */
export const visitor = (c: AppContext): Visitor => ({
  ga: gaClient(c.req.header('cookie')),
  meta: metaBrowser(c.req.url, c.req.raw.headers),
  touch: firstTouchCookie(c.req.header('cookie')),
  redditVisitId: c.get('redditVisitId') ?? redditVisitCookie(c.req.header('cookie')),
});

export { canonicalRedirect, legacyHosts } from './canonical';

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

/** The caller's address, for rate limits on anonymous writes (blog comments, sign-ups). */
export function clientIp(c: AppContext): string | null {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}
