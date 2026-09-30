import type Stripe from 'stripe';
import { realEmail } from '../lib/auth-options';
import { now } from '../lib/ids';
import type { Account } from './accounts';
import { BlogError } from './blog';

/**
 * Supporters: a monthly Stripe subscription that unlocks the blog's paid posts. Ported from
 * skillbay's services/supporters.ts. The price is created once in Stripe and cached in
 * settings. Status comes from Checkout (on completion) and from subscription webhooks when
 * they arrive; because renewals and cancellations may not reach us as events, a stale row
 * is re-checked with Stripe when it is read, at most once a day.
 *
 * call4me and skillbay share one Stripe account and both webhooks see every event. So the
 * Checkout session and the subscription never carry client_reference_id (skillbay fulfils
 * any session that has one) or a user_id metadata key (skillbay's supporter sync reads it);
 * they are tagged app=callbay, kind=supporter, account_id instead (SUPPORTER_METADATA), and
 * isSupporterObject is how the webhook tells them apart from credit reloads and from
 * skillbay's own supporters.
 */

export interface SupporterRow {
  account_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: string;
  current_period_end: number | null;
  checked_at: number;
  created_at: number;
  updated_at: number;
}

const ACTIVE = new Set(['active', 'trialing', 'past_due']);
const RECHECK_MS = 24 * 3600 * 1000;
const PRICE_KEY = 'supporter_price_id';

export const DEFAULT_SUPPORTER_CENTS = 500;

/** Metadata on every supporter Checkout session and subscription. */
export const SUPPORTER_METADATA = (accountId: string) => ({ app: 'callbay', kind: 'supporter', account_id: accountId });

/** A Stripe object (Checkout session, subscription, invoice parent) that belongs to call4me's supporter tier. */
export const isSupporterObject = (metadata: Stripe.Metadata | null | undefined): boolean => metadata?.app === 'callbay' && metadata?.kind === 'supporter';

export function supporters(db: D1Database, stripe: Stripe, env: { SUPPORTER_PRICE_CENTS?: string }) {
  const cents = () => {
    const n = Number(env.SUPPORTER_PRICE_CENTS ?? DEFAULT_SUPPORTER_CENTS);
    return Number.isInteger(n) && n >= 100 ? n : DEFAULT_SUPPORTER_CENTS;
  };

  async function upsert(accountId: string, sub: Stripe.Subscription): Promise<void> {
    const t = now();
    const periodEnd = sub.items.data[0]?.current_period_end ?? null;
    const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    await db
      .prepare(
        `INSERT INTO supporters (account_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, checked_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id,
           status = excluded.status, current_period_end = excluded.current_period_end, checked_at = excluded.checked_at, updated_at = excluded.updated_at`,
      )
      .bind(accountId, customer, sub.id, sub.status, periodEnd ? periodEnd * 1000 : null, t, t, t)
      .run();
  }

  return {
    cents,

    /** The monthly price, created in Stripe on first use and cached. */
    async priceId(): Promise<string> {
      const cached = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(PRICE_KEY).first<{ value: string }>();
      if (cached) return cached.value;
      const price = await stripe.prices.create({
        currency: 'usd',
        unit_amount: cents(),
        recurring: { interval: 'month' },
        product_data: { name: 'call4me supporter', metadata: { app: 'callbay', kind: 'supporter' } },
        metadata: { app: 'callbay', kind: 'supporter' },
      });
      await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(PRICE_KEY, price.id, now()).run();
      return price.id;
    },

    /** Is this account a supporter right now? Re-checks Stripe when the row looks stale. */
    async isSupporter(accountId: string): Promise<boolean> {
      let row = await db.prepare(`SELECT * FROM supporters WHERE account_id = ?`).bind(accountId).first<SupporterRow>();
      if (!row) return false;
      const t = now();
      const stale = t - row.checked_at > RECHECK_MS || (row.current_period_end !== null && row.current_period_end < t && ACTIVE.has(row.status));
      if (stale) {
        try {
          await upsert(accountId, await stripe.subscriptions.retrieve(row.stripe_subscription_id));
          row = (await db.prepare(`SELECT * FROM supporters WHERE account_id = ?`).bind(accountId).first<SupporterRow>()) ?? row;
        } catch (err) {
          console.warn('supporter re-check failed', String(err));
        }
      }
      return ACTIVE.has(row.status) || (row.status === 'canceled' && (row.current_period_end ?? 0) > t);
    },

    row: (accountId: string) => db.prepare(`SELECT * FROM supporters WHERE account_id = ?`).bind(accountId).first<SupporterRow>(),

    /**
     * Checkout for the subscription. The session and subscription carry the account id in
     * metadata (never client_reference_id; see the note at the top), and reuse the Stripe
     * customer the account already has from buying credits.
     */
    async checkout(account: Account, origin: string, next: string): Promise<string> {
      const existing = await this.row(account.id);
      if (existing && (await this.isSupporter(account.id))) throw new BlogError('you already support call4me', 409);
      const customer =
        existing?.stripe_customer_id ?? (await db.prepare(`SELECT stripe_customer_id FROM accounts WHERE id = ?`).bind(account.id).first<{ stripe_customer_id: string | null }>())?.stripe_customer_id ?? undefined;
      const metadata = SUPPORTER_METADATA(account.id);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: await this.priceId(), quantity: 1 }],
        ...(customer ? { customer } : { customer_email: realEmail(account.email) ?? undefined }),
        metadata,
        subscription_data: { metadata },
        success_url: `${origin}/blog/support/done?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(next)}`,
        cancel_url: `${origin}${next}`,
        allow_promotion_codes: true,
      });
      if (!session.url) throw new BlogError('stripe did not return a checkout url', 502);
      return session.url;
    },

    /** After Checkout returns (and from the webhook): record the subscription. */
    async completeSession(sessionId: string, expectAccountId?: string): Promise<boolean> {
      if (!sessionId) return false;
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
      const accountId = session.metadata?.account_id;
      if (session.mode !== 'subscription' || !isSupporterObject(session.metadata) || !accountId || (expectAccountId && accountId !== expectAccountId)) return false;
      const sub = typeof session.subscription === 'string' ? await stripe.subscriptions.retrieve(session.subscription) : session.subscription;
      if (!sub) return false;
      await upsert(accountId, sub);
      return true;
    },

    /** From customer.subscription.* webhooks, matched by metadata or subscription id. */
    async syncSubscription(sub: Stripe.Subscription): Promise<void> {
      const accountId =
        (isSupporterObject(sub.metadata) ? sub.metadata.account_id : undefined) ??
        (await db.prepare(`SELECT account_id FROM supporters WHERE stripe_subscription_id = ?`).bind(sub.id).first<{ account_id: string }>())?.account_id;
      if (accountId) await upsert(accountId, sub);
    },

    /** Stripe's hosted portal: change card, cancel, see invoices. */
    async portal(accountId: string, origin: string): Promise<string> {
      const row = await this.row(accountId);
      if (!row) throw new BlogError('no supporter subscription', 404);
      return (await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: `${origin}/blog` })).url;
    },
  };
}
