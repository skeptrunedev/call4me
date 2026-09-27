import Stripe from 'stripe';
import { newId, now } from '../lib/ids';
import { accounts, type Account } from './accounts';

export const MIN_TOPUP_CENTS = 1000;
export const MAX_TOPUP_CENTS = 50_000;

export function makeStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 30_000 });
}

export class TopupError extends Error {}

export function parseAmountCents(input: string | number | undefined): number {
  const n = typeof input === 'number' ? input : Number(String(input ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new TopupError('enter an amount in dollars');
  const cents = Math.round(n * 100);
  if (cents < MIN_TOPUP_CENTS) throw new TopupError(`the minimum is $${MIN_TOPUP_CENTS / 100}`);
  if (cents > MAX_TOPUP_CENTS) throw new TopupError(`the maximum is $${MAX_TOPUP_CENTS / 100} at a time`);
  return cents;
}

interface TopupRow {
  id: string;
  account_id: string | null;
  email: string | null;
  amount_cents: number;
  monthly: number;
  status: 'pending' | 'paid' | 'refunded';
  key_revealed: number;
}

export interface Reload {
  cents: number;
  status: string;
  renewsAt: number | null;
}

const PRODUCT = { name: 'callbay credits', description: 'Prepaid credits for phone calls your AI agent places.' };

/** Where a subscription's invoices land: the account it was bought for. */
const subscriptionOf = (invoice: Stripe.Invoice): string | null => {
  const sub = invoice.parent?.subscription_details?.subscription;
  return typeof sub === 'string' ? sub : (sub?.id ?? null);
};

/** The account's live monthly reload, from our own records (no Stripe call). */
export async function reloadOf(db: D1Database, accountId: string): Promise<Reload | null> {
  const r = await db
    .prepare(`SELECT reload_cents, reload_status, reload_renews_at FROM accounts WHERE id = ? AND reload_subscription_id IS NOT NULL`)
    .bind(accountId)
    .first<{ reload_cents: number | null; reload_status: string | null; reload_renews_at: number | null }>();
  if (!r || !r.reload_cents || !r.reload_status || r.reload_status === 'canceled' || r.reload_status === 'incomplete_expired') return null;
  return { cents: r.reload_cents, status: r.reload_status, renewsAt: r.reload_renews_at };
}

export function topups(db: D1Database, stripe: Stripe) {
  const ledger = accounts(db);

  async function attach(account: Account, customerId: string | null): Promise<void> {
    if (customerId) await db.prepare(`UPDATE accounts SET stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?`).bind(customerId, account.id).run();
  }

  /** Make `sub` the account's one monthly reload, cancelling any reload it replaces. */
  async function adoptSubscription(account: Account, sub: Stripe.Subscription, cents: number): Promise<void> {
    const prev = await db.prepare(`SELECT reload_subscription_id FROM accounts WHERE id = ?`).bind(account.id).first<{ reload_subscription_id: string | null }>();
    if (prev?.reload_subscription_id && prev.reload_subscription_id !== sub.id) {
      await stripe.subscriptions.cancel(prev.reload_subscription_id).catch((err) => console.warn('cancel replaced reload', String(err)));
    }
    await syncSubscription(sub, account.id, cents);
  }

  async function syncSubscription(sub: Stripe.Subscription, accountId?: string, cents?: number): Promise<void> {
    const renews = sub.items.data[0]?.current_period_end ?? null;
    const amount = cents ?? sub.items.data[0]?.price.unit_amount ?? null;
    const live = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
    if (accountId) {
      await db
        .prepare(`UPDATE accounts SET reload_subscription_id = ?, reload_cents = ?, reload_status = ?, reload_renews_at = ? WHERE id = ?`)
        .bind(sub.id, amount, sub.status, renews ? renews * 1000 : null, accountId)
        .run();
    } else {
      await db
        .prepare(`UPDATE accounts SET reload_status = ?, reload_renews_at = ?, reload_cents = COALESCE(?, reload_cents) WHERE reload_subscription_id = ?`)
        .bind(sub.status, live && renews ? renews * 1000 : null, amount, sub.id)
        .run();
    }
  }

  return {
    /**
     * A Checkout session that adds `amountCents` now and, when `monthly`, again every month
     * (a subscription for that amount). New buyers give an email; existing accounts are passed in.
     */
    async checkout(opts: { amountCents: number; monthly: boolean; origin: string; email?: string; account?: Account }): Promise<string> {
      const id = newId();
      const email = opts.account?.email ?? opts.email?.trim().toLowerCase();
      const customer = opts.account ? (await db.prepare(`SELECT stripe_customer_id FROM accounts WHERE id = ?`).bind(opts.account.id).first<{ stripe_customer_id: string | null }>())?.stripe_customer_id : null;
      const price_data = { currency: 'usd', unit_amount: opts.amountCents, product_data: PRODUCT };
      const session = await stripe.checkout.sessions.create({
        ...(customer ? { customer } : { customer_email: email }),
        // No client_reference_id: other apps on this Stripe account (skillbay) treat any session
        // carrying one as theirs. Ours are found by session id and tagged app=callbay.
        success_url: `${opts.origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${opts.origin}/`,
        metadata: { app: 'callbay', topup_id: id },
        ...(opts.monthly
          ? {
              mode: 'subscription' as const,
              line_items: [{ quantity: 1, price_data: { ...price_data, recurring: { interval: 'month' as const } } }],
              subscription_data: { metadata: { app: 'callbay', topup_id: id } },
            }
          : {
              mode: 'payment' as const,
              line_items: [{ quantity: 1, price_data }],
              ...(customer ? {} : { customer_creation: 'always' as const }),
            }),
      });
      await db
        .prepare(`INSERT INTO topups (id, account_id, email, amount_cents, monthly, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, opts.account?.id ?? null, email ?? null, opts.amountCents, opts.monthly ? 1 : 0, session.id, now())
        .run();
      return session.url!;
    },

    /**
     * Credit a completed Checkout session. Called by both the webhook and the success page:
     * ledger refs (the session, or the first invoice) make the money land exactly once.
     */
    async fulfill(sessionId: string): Promise<{ account: Account; topup: TopupRow } | null> {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription', 'invoice'] });
      if (session.status !== 'complete' || session.payment_status === 'unpaid') return null;
      const topup = await db.prepare(`SELECT * FROM topups WHERE stripe_session_id = ?`).bind(sessionId).first<TopupRow>();
      if (!topup) return null;
      const email = topup.email ?? session.customer_details?.email;
      const account = topup.account_id ? await ledger.byId(topup.account_id) : email ? await ledger.ensure(email) : null;
      if (!account) return null;
      await attach(account, typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null));
      await db.prepare(`UPDATE topups SET account_id = ?, status = 'paid', paid_at = COALESCE(paid_at, ?) WHERE id = ?`).bind(account.id, now(), topup.id).run();

      if (session.mode === 'subscription') {
        const sub = session.subscription as Stripe.Subscription;
        const invoice = session.invoice as Stripe.Invoice | null;
        await adoptSubscription(account, sub, topup.amount_cents);
        if (invoice?.status === 'paid') await ledger.post(account.id, invoice.amount_paid, 'topup', `invoice:${invoice.id}`, 'card, reloads monthly');
      } else {
        await ledger.post(account.id, topup.amount_cents, 'topup', `stripe:${sessionId}`, 'card');
      }
      return { account, topup: { ...topup, account_id: account.id, status: 'paid' } };
    },

    /** A paid subscription invoice: the monthly reload (the first one is also credited by fulfill; same ref). */
    async invoicePaid(invoice: Stripe.Invoice): Promise<void> {
      const subId = subscriptionOf(invoice);
      if (!subId || invoice.amount_paid <= 0) return;
      const row = await db.prepare(`SELECT id FROM accounts WHERE reload_subscription_id = ?`).bind(subId).first<{ id: string }>();
      if (!row) return; // the first invoice can beat checkout.session.completed; fulfill credits it
      const kind = invoice.billing_reason === 'subscription_cycle' ? 'reload' : 'topup';
      await ledger.post(row.id, invoice.amount_paid, kind, `invoice:${invoice.id}`, kind === 'reload' ? 'monthly reload' : 'card, reloads monthly');
    },

    syncSubscription: (sub: Stripe.Subscription) => syncSubscription(sub),

    /** Stop the monthly reload now. Credits already loaded stay. */
    async stopReload(accountId: string): Promise<void> {
      const r = await db.prepare(`SELECT reload_subscription_id FROM accounts WHERE id = ?`).bind(accountId).first<{ reload_subscription_id: string | null }>();
      if (!r?.reload_subscription_id) return;
      const sub = await stripe.subscriptions.cancel(r.reload_subscription_id);
      await syncSubscription(sub);
    },

    /**
     * The first API key, shown once on the success page of the purchase that created the
     * account. Later purchases and a second visit get null (keys are reissued by email).
     */
    async revealFirstKey(topupId: string, account: Account): Promise<string | null> {
      if (account.key_prefix) return null;
      const r = await db.prepare(`UPDATE topups SET key_revealed = 1 WHERE id = ? AND key_revealed = 0`).bind(topupId).run();
      if ((r.meta.changes ?? 0) === 0) return null;
      return ledger.rotateKey(account.id);
    },

    /** A refunded one-time top-up takes its credits back out. */
    async refunded(paymentIntentId: string): Promise<void> {
      const s = (await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })).data[0];
      if (!s) return;
      const topup = await db.prepare(`SELECT * FROM topups WHERE stripe_session_id = ?`).bind(s.id).first<TopupRow>();
      if (!topup?.account_id) return;
      await db.prepare(`UPDATE topups SET status = 'refunded' WHERE id = ?`).bind(topup.id).run();
      await ledger.post(topup.account_id, -topup.amount_cents, 'refund', `refund:${s.id}`, 'card refund');
    },
  };
}

export async function verifyWebhook(stripe: Stripe, body: string, signature: string, secret: string): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(body, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
}
