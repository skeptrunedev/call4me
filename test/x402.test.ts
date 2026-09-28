import { describe, expect, it } from 'vitest';
import { atomicAmount, encodeHeader, matchRequirements, paymentFromRequest, paymentRequiredResponse, requirementsFor, x402Config, type PaymentPayload } from '../src/server/lib/x402';

const WALLET = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';

describe('x402 requirements', () => {
  it('converts cents to USDC atomic units on both networks', () => {
    expect(atomicAmount(500, 'eip155:8453')).toBe('5000000');
    expect(atomicAmount(1, 'eip155:84532')).toBe('10000');
    expect(atomicAmount(10_000 * 100, 'eip155:8453')).toBe('10000000000');
  });
  it('builds exact-scheme requirements with the right USDC contract and EIP-712 domain', () => {
    const r = requirementsFor(500, WALLET, 'eip155:8453');
    expect(r).toEqual({ scheme: 'exact', network: 'eip155:8453', amount: '5000000', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } });
    expect(requirementsFor(100, WALLET, 'eip155:84532').extra).toEqual({ name: 'USDC', version: '2' });
  });
});

describe('402 response and payment header', () => {
  const pr = { x402Version: 2 as const, error: 'PAYMENT-SIGNATURE header is required', resource: { url: 'https://skillbay.sh/api/v1/skills/x/download', mimeType: 'application/zip' }, accepts: [requirementsFor(500, WALLET, 'eip155:8453')] };
  it('puts the requirements in the PAYMENT-REQUIRED header and the body', async () => {
    const res = paymentRequiredResponse(pr);
    expect(res.status).toBe(402);
    expect(JSON.parse(atob(res.headers.get('payment-required')!))).toEqual(pr);
    expect((await res.json()) as unknown).toEqual(pr);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
  it('decodes PAYMENT-SIGNATURE or legacy X-PAYMENT and matches the accepted requirements', () => {
    const payload: PaymentPayload = {
      x402Version: 2,
      accepted: pr.accepts[0]!,
      payload: { signature: '0xabc', authorization: { from: '0x857b06519E91e3A54538791bDbb0E22373e36b66', to: WALLET, value: '5000000', validAfter: '0', validBefore: '9999999999', nonce: '0x01' } },
    };
    const req = new Request('https://skillbay.sh/x', { headers: { 'payment-signature': encodeHeader(payload) } });
    expect(paymentFromRequest(req)).toEqual(payload);
    expect(matchRequirements(pr.accepts, payload)).toBe(pr.accepts[0]);
    const legacy = new Request('https://skillbay.sh/x', { headers: { 'x-payment': encodeHeader({ x402Version: 1, scheme: 'exact', network: 'base', payload: payload.payload }) } });
    expect(matchRequirements(pr.accepts, paymentFromRequest(legacy)!)).toBe(pr.accepts[0]);
    expect(matchRequirements(pr.accepts, { ...payload, accepted: { ...pr.accepts[0]!, amount: '1' } })).toBeNull();
    expect(paymentFromRequest(new Request('https://skillbay.sh/x'))).toBeNull();
    expect(() => paymentFromRequest(new Request('https://skillbay.sh/x', { headers: { 'payment-signature': btoa('{"nope":1}') } }))).toThrow();
  });
});

describe('x402Config', () => {
  it('defaults to Base mainnet through PayAI, CDP when keys exist, x402.org for Sepolia', () => {
    expect(x402Config({})).toEqual({ network: 'eip155:8453', facilitator: { url: 'https://facilitator.payai.network', cdp: undefined } });
    expect(x402Config({ CDP_API_KEY_ID: 'id', CDP_API_KEY_SECRET: 's' })?.facilitator.url).toBe('https://api.cdp.coinbase.com/platform/v2/x402');
    expect(x402Config({ X402_NETWORK: 'eip155:84532' })?.facilitator.url).toBe('https://x402.org/facilitator');
    expect(x402Config({ X402_NETWORK: 'solana' })).toBeNull();
  });
});
