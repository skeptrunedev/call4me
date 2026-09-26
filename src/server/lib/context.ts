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

/** Read a string form field, trimmed, with a max length. */
export function field(form: FormData, name: string, max = 10_000): string {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Stripe, built on first use: only the routes that move money need its key. */
export const stripeFor = (c: AppContext): Stripe => makeStripe(c.env.STRIPE_SECRET_KEY);
