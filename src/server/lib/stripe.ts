import type Stripe from 'stripe';

// ---- machine payments (x402 over USDC on Base, settled into the Stripe balance)
// Ported from skillbay's lib/stripe.ts; call4me and skillbay share one Stripe account.

/** The preview API version that carries crypto deposit addresses and transaction-verified PaymentIntents. */
export const CRYPTO_API_VERSION = '2026-05-27.preview';

export type CryptoNetwork = 'base' | 'tempo' | 'solana';

export interface DepositAddress {
  id: string;
  address: string;
  network: CryptoNetwork;
  livemode: boolean;
  supported_tokens: { token_contract_address: string; token_currency: string }[];
}

/**
 * The on-chain address Stripe watches for us on a network: reuse the newest one, create
 * one if there is none. Money sent there is off-ramped into the Stripe balance.
 */
export async function depositAddress(stripe: Stripe, network: CryptoNetwork): Promise<DepositAddress> {
  const opts = { apiVersion: CRYPTO_API_VERSION };
  const existing = (await stripe.rawRequest('GET', `/v1/crypto/deposit_addresses?network=${network}&limit=1`, undefined, opts)) as unknown as { data: DepositAddress[] };
  if (existing.data[0]) return existing.data[0];
  return (await stripe.rawRequest('POST', '/v1/crypto/deposit_addresses', { network }, opts)) as unknown as DepositAddress;
}

/** Record a settled on-chain payment as a PaymentIntent so it shows up, refunds, and reports like any other sale. */
export async function recordCryptoPayment(
  stripe: Stripe,
  opts: { amountCents: number; network: CryptoNetwork; transactionHash: string; description: string; metadata: Record<string, string> },
): Promise<{ id: string; status: string }> {
  const params: Record<string, unknown> = {
    amount: opts.amountCents,
    currency: 'usd',
    confirm: true,
    description: opts.description,
    metadata: opts.metadata,
    payment_method_data: { type: 'crypto' },
    allowed_payment_method_types: ['crypto'],
    payment_method_options: { crypto: { mode: 'transaction_verification', transaction_verification_options: { network: opts.network, transaction_hash: opts.transactionHash } } },
  };
  const pi = (await stripe.rawRequest('POST', '/v1/payment_intents', params, { apiVersion: CRYPTO_API_VERSION, idempotencyKey: `x402:${opts.transactionHash}` })) as unknown as { id: string; status: string };
  return { id: pi.id, status: pi.status };
}
