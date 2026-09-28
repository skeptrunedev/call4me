import type Stripe from 'stripe';
import { now } from '../lib/ids';
import { depositAddress, recordCryptoPayment, type CryptoNetwork } from '../lib/stripe';
import {
  bazaarExtension, encodeHeader, facilitator, isEvmAddress, matchRequirements, paymentFromRequest, paymentRequiredResponse, requirementsFor, x402Config,
  type Network, type PaymentPayload, type PaymentRequired, type PaymentRequirements, type SettleResponse,
} from '../lib/x402';

/**
 * Selling call credits over HTTP 402 with Stripe holding the money, the way skillbay sells
 * over x402. The payTo address in every 402 is a Stripe crypto deposit address on Base;
 * Stripe off-ramps what lands there into the Stripe balance. A facilitator (PayAI by default,
 * no account) verifies and settles the buyer's USDC authorization on-chain, then the
 * transaction is recorded as a PaymentIntent so it refunds and reports like a card top-up.
 * Nobody on callbay holds a wallet. Crediting the account is the caller's job (routes/api-root.ts).
 */

/** A thing that can be paid for. */
export interface Payable {
  /** Absolute URL the client asked for. */
  url: string;
  description: string;
  mimeType: string;
  cents: number;
  payTo: string;
  /** Bazaar route template, for the discovery extension. */
  route: { template: string };
}

export type Collected =
  /** No usable payment: the 402 to send. */
  | { paid: false; response: Response }
  /** Settled on this request. */
  | { paid: true; payer: string; transaction: string; amount: string; paymentIntentId: string | null; paymentResponse: string };

const STRIPE_NETWORK: Record<Network, CryptoNetwork> = { 'eip155:8453': 'base', 'eip155:84532': 'base' };
const ADDRESS_KEY = (network: Network) => `stripe_deposit_address:${network}`;

/** Does the request carry a payment (v2 PAYMENT-SIGNATURE or legacy X-PAYMENT)? */
export const carriesPayment = (req: Request) => req.headers.has('payment-signature') || req.headers.has('x-payment');

export function x402(env: Env, stripe: Stripe) {
  const db = env.DB;
  // A test key means Stripe's sandbox, whose deposit addresses live on Base Sepolia.
  const cfg = x402Config(env, { livemode: !env.STRIPE_SECRET_KEY.includes('_test_') });

  return {
    enabled: cfg !== null,
    network: cfg?.network ?? null,

    /**
     * Where buyers pay: X402_PAY_TO when set (an override), else the Stripe deposit
     * address for the network, minted once and cached. Null when x402 is off or Stripe
     * has not enabled stablecoin payments for the account.
     */
    async payTo(): Promise<string | null> {
      if (!cfg) return null;
      if (env.X402_PAY_TO && isEvmAddress(env.X402_PAY_TO)) return env.X402_PAY_TO;
      const key = ADDRESS_KEY(cfg.network);
      const cached = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>();
      if (cached && isEvmAddress(cached.value)) return cached.value;
      try {
        const minted = await depositAddress(stripe, STRIPE_NETWORK[cfg.network]);
        await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(key, minted.address, now()).run();
        return minted.address;
      } catch (err) {
        console.error('stripe deposit address unavailable', String(err));
        return null;
      }
    },

    /** The 402 requirements document for a payable. */
    required(p: Payable): PaymentRequired {
      if (!cfg) throw new Error('x402 is not configured');
      return {
        x402Version: 2,
        resource: { url: p.url, description: p.description, mimeType: p.mimeType },
        accepts: [requirementsFor(p.cents, p.payTo, cfg.network)],
        extensions: bazaarExtension(p.route.template, p.description, p.mimeType),
      };
    },

    /**
     * Take payment for a payable: read the client's payment header; with none (or a bad
     * one) return the 402; otherwise verify, settle, and record in Stripe. Settling comes
     * before crediting: the buyer's money must be on-chain before the credits exist.
     */
    async collect(req: Request, p: Payable, metadata: Record<string, string>): Promise<Collected> {
      if (!cfg) throw new Error('x402 is not configured');
      const required = this.required(p);

      let payload: PaymentPayload | null;
      try {
        payload = paymentFromRequest(req);
      } catch {
        return { paid: false, response: paymentRequiredResponse({ ...required, error: 'malformed PAYMENT-SIGNATURE header' }) };
      }
      if (!payload) return { paid: false, response: paymentRequiredResponse({ ...required, error: 'PAYMENT-SIGNATURE header is required' }) };

      const chosen: PaymentRequirements | null = matchRequirements(required.accepts, payload);
      if (!chosen) return { paid: false, response: paymentRequiredResponse({ ...required, error: 'payment does not match the accepted requirements' }) };

      const fac = facilitator(cfg.facilitator);
      const verdict = await fac.verify(payload, chosen);
      if (!verdict.isValid) return { paid: false, response: paymentRequiredResponse({ ...required, error: `payment rejected: ${verdict.invalidReason ?? 'invalid'}` }) };

      let settled: SettleResponse = await fac.settle(payload, chosen);
      if (!settled.success && settled.errorReason === 'settlement_pending') settled = await fac.settle(payload, chosen);
      if (!settled.success) {
        const res = paymentRequiredResponse({ ...required, error: `settlement failed: ${settled.errorReason ?? 'unknown'}` });
        res.headers.set('payment-response', encodeHeader(settled));
        return { paid: false, response: res };
      }

      // The USDC is on-chain at Stripe's address now; tell Stripe so it becomes a sale.
      const payer = settled.payer ?? payload.payload.authorization.from;
      let paymentIntentId: string | null = null;
      try {
        const pi = await recordCryptoPayment(stripe, {
          amountCents: p.cents,
          network: STRIPE_NETWORK[cfg.network],
          transactionHash: settled.transaction,
          description: p.description,
          metadata: { app: 'callbay', x402: '1', transaction: settled.transaction, payer, ...metadata },
        });
        paymentIntentId = pi.id;
      } catch (err) {
        // The buyer paid; never fail them for our bookkeeping. The tx hash is on the ledger entry for a retry.
        console.error('stripe crypto PaymentIntent failed', settled.transaction, String(err));
      }
      return { paid: true, payer, transaction: settled.transaction, amount: chosen.amount, paymentIntentId, paymentResponse: encodeHeader(settled) };
    },
  };
}
