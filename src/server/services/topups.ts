import Stripe from 'stripe';
import { newId, now } from '../lib/ids';
import { accounts, type Account } from './accounts';

export const MIN_TOPUP_CENTS = 2000;
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
  status: 'pending' | 'paid' | 'refunded';
  key_revealed: number;
}

export function topups(db: D1Database, stripe: Stripe) {
  return {
    /** A Checkout session that adds `amountCents`. Either a new buyer (email) or an existing account. */
    async checkout(opts: { amountCents: number; origin: string; email?: string; account?: Account }): Promise<string> {
      const id = newId();
      const email = opts.account?.email ?? opts.email?.trim().toLowerCase();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email,
        client_reference_id: id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: opts.amountCents,
              product_data: { name: 'callbay call credit', description: 'Prepaid minutes for phone calls your AI agent places.' },
            },
          },
        ],
        success_url: `${opts.origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${opts.origin}/`,
        metadata: { topup_id: id },
      });
      await db
        .prepare(`INSERT INTO topups (id, account_id, email, amount_cents, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, opts.account?.id ?? null, email ?? null, opts.amountCents, session.id, now())
        .run();
      return session.url!;
    },

    /**
     * Credit a paid session. Safe to call from both the webhook and the success page:
     * the ledger ref is the session id, so the money lands exactly once.
     */
    async fulfill(sessionId: string): Promise<{ account: Account; topup: TopupRow } | null> {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') return null;
      const topup = await db.prepare(`SELECT * FROM topups WHERE stripe_session_id = ?`).bind(sessionId).first<TopupRow>();
      if (!topup) return null;
      const email = topup.email ?? session.customer_details?.email;
      const account = topup.account_id ? await accounts(db).byId(topup.account_id) : email ? await accounts(db).ensure(email) : null;
      if (!account) return null;
      await db.prepare(`UPDATE topups SET account_id = ?, status = 'paid', paid_at = COALESCE(paid_at, ?) WHERE id = ?`).bind(account.id, now(), topup.id).run();
      await accounts(db).post(account.id, topup.amount_cents, 'topup', `stripe:${sessionId}`, 'card');
      return { account, topup: { ...topup, account_id: account.id, status: 'paid' } };
    },

    /**
     * The first API key, shown once on the success page of the purchase that created the
     * account. Later purchases and a second visit get null (keys are reissued by email).
     */
    async revealFirstKey(topupId: string, account: Account): Promise<string | null> {
      if (account.key_prefix) return null;
      const r = await db.prepare(`UPDATE topups SET key_revealed = 1 WHERE id = ? AND key_revealed = 0`).bind(topupId).run();
      if ((r.meta.changes ?? 0) === 0) return null;
      return accounts(db).rotateKey(account.id);
    },

    async refunded(paymentIntentId: string): Promise<void> {
      const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
      const s = sessions.data[0];
      if (!s) return;
      const topup = await db.prepare(`SELECT * FROM topups WHERE stripe_session_id = ?`).bind(s.id).first<TopupRow>();
      if (!topup?.account_id) return;
      await db.prepare(`UPDATE topups SET status = 'refunded' WHERE id = ?`).bind(topup.id).run();
      await accounts(db).post(topup.account_id, -topup.amount_cents, 'refund', `refund:${s.id}`, 'card refund');
    },
  };
}

export async function verifyWebhook(stripe: Stripe, body: string, signature: string, secret: string): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(body, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
}
