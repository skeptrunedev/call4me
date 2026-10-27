import { importPKCS8, importJWK, SignJWT } from 'jose';

/**
 * x402 v2 (x402.org): HTTP 402 payments in USDC on Base, settled by a facilitator.
 *
 * Flow for a paid skill package fetched by an agent with a wallet:
 *   1. GET without payment -> 402 with a `PAYMENT-REQUIRED` header (base64 JSON below); the
 *      same JSON is in the body so v1-era clients and scanners can read it.
 *   2. The agent signs an EIP-3009 transferWithAuthorization for the exact amount to the
 *      seller's wallet and retries with `PAYMENT-SIGNATURE` (or legacy `X-PAYMENT`).
 *   3. We ask the facilitator to verify, then settle (it pays gas), then serve the file with
 *      `PAYMENT-RESPONSE`. Settling before serving: a download cannot be taken back.
 *
 * Money goes straight from the buyer to the seller's address; the facilitator cannot change
 * the amount or destination, and skillbay never holds funds.
 */

export const X402_VERSION = 2;

export const NETWORKS = {
  'eip155:8453': { name: 'Base', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', extra: { name: 'USD Coin', version: '2' }, decimals: 6 },
  'eip155:84532': { name: 'Base Sepolia', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', extra: { name: 'USDC', version: '2' }, decimals: 6 },
} as const;
export type Network = keyof typeof NETWORKS;

export const isNetwork = (n: string): n is Network => n in NETWORKS;
export const isEvmAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

export interface PaymentRequirements {
  scheme: 'exact';
  network: Network;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

export interface PaymentPayload {
  x402Version: number;
  resource?: ResourceInfo;
  accepted?: PaymentRequirements;
  scheme?: string; // v1
  network?: string; // v1
  payload: { signature: string; authorization: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string } };
  extensions?: Record<string, unknown>;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  transaction: string;
  network: string;
  payer?: string;
  errorReason?: string;
  errorMessage?: string;
}

/** USD cents to the token's atomic units (USDC has six decimals: $5.00 = "5000000"). */
export function atomicAmount(cents: number, network: Network): string {
  const decimals = NETWORKS[network].decimals;
  return (BigInt(cents) * 10n ** BigInt(decimals - 2)).toString();
}

export function requirementsFor(cents: number, payTo: string, network: Network, maxTimeoutSeconds = 300): PaymentRequirements {
  const n = NETWORKS[network];
  return { scheme: 'exact', network, amount: atomicAmount(cents, network), asset: n.asset, payTo, maxTimeoutSeconds, extra: { ...n.extra } };
}

const enc = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = (s: string) => JSON.parse(decodeURIComponent(escape(atob(s.trim())))) as unknown;

export const encodeHeader = enc;

/** Bazaar discovery extension (x402 extensions/bazaar) so the CDP index can describe the resource. */
export function bazaarExtension(routeTemplate: string, description: string, mimeType = 'application/zip', pathParams?: Record<string, string>): Record<string, unknown> {
  const params = pathParams ?? {};
  const names = Object.keys(params);
  return {
    bazaar: {
      info: {
        input: { type: 'http', method: 'GET', ...(names.length ? { pathParams: params } : {}) },
        output: { type: mimeType === 'application/json' ? 'json' : 'file', mimeType, description },
        routeTemplate,
      },
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: names.length
          ? { pathParams: { type: 'object', properties: Object.fromEntries(names.map((n) => [n, { type: 'string', description: params[n] }])), required: names } }
          : {},
      },
    },
  };
}

/** The 402 response: header for v2 clients, body for everyone else. */
export function paymentRequiredResponse(pr: PaymentRequired, browserHtml?: string): Response {
  const headers = new Headers({ 'payment-required': enc(pr), 'cache-control': 'private, no-store', 'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE' });
  if (browserHtml) {
    headers.set('content-type', 'text/html; charset=utf-8');
    return new Response(browserHtml, { status: 402, headers });
  }
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(pr, null, 2), { status: 402, headers });
}

/** Read and decode the client's payment header, if any. Throws on malformed input. */
export function paymentFromRequest(req: Request): PaymentPayload | null {
  const raw = req.headers.get('payment-signature') ?? req.headers.get('x-payment');
  if (!raw) return null;
  const payload = dec(raw) as PaymentPayload;
  if (!payload || typeof payload !== 'object' || !payload.payload?.authorization || typeof payload.payload.signature !== 'string') throw new Error('malformed payment payload');
  return payload;
}

/** Which of our requirements the client accepted (v2 echoes it; v1 names scheme + network). */
export function matchRequirements(accepts: PaymentRequirements[], payload: PaymentPayload): PaymentRequirements | null {
  if (payload.x402Version >= 2 && payload.accepted) {
    const a = payload.accepted;
    return accepts.find((r) => r.scheme === a.scheme && r.network === a.network && r.amount === a.amount && r.asset.toLowerCase() === a.asset.toLowerCase() && r.payTo.toLowerCase() === a.payTo.toLowerCase()) ?? null;
  }
  return accepts.find((r) => r.scheme === payload.scheme && (r.network === payload.network || legacyNetworkName(r.network) === payload.network)) ?? null;
}

const legacyNetworkName = (n: Network) => (n === 'eip155:8453' ? 'base' : 'base-sepolia');

export interface FacilitatorConfig {
  url: string;
  /** Coinbase Developer Platform credentials; when present, each call carries a CDP JWT. */
  cdp?: { keyId: string; keySecret: string };
}

/**
 * The facilitator client: plain fetch to /verify and /settle. For the CDP facilitator the
 * request is authenticated with a short-lived JWT signed by the CDP secret API key (ES256 for
 * PEM keys, EdDSA for the base64 Ed25519 form), one per method and path.
 */
export function facilitator(cfg: FacilitatorConfig) {
  const base = cfg.url.replace(/\/$/, '');

  async function authHeader(method: string, path: string): Promise<Record<string, string>> {
    if (!cfg.cdp) return {};
    const host = new URL(base).host;
    const now = Math.floor(Date.now() / 1000);
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const secret = cfg.cdp.keySecret;
    const isPem = secret.includes('BEGIN');
    const key = isPem
      ? await importPKCS8(secret, 'ES256')
      : await importJWK({ kty: 'OKP', crv: 'Ed25519', d: base64url(Uint8Array.from(atob(secret), (ch) => ch.charCodeAt(0)).slice(0, 32)), x: base64url(Uint8Array.from(atob(secret), (ch) => ch.charCodeAt(0)).slice(32, 64)) }, 'EdDSA');
    const jwt = await new SignJWT({ sub: cfg.cdp.keyId, iss: 'cdp', aud: ['cdp_service'], uris: [`${method} ${host}${path}`] })
      .setProtectedHeader({ alg: isPem ? 'ES256' : 'EdDSA', typ: 'JWT', kid: cfg.cdp.keyId, nonce })
      .setNotBefore(now)
      .setExpirationTime(now + 120)
      .sign(key);
    return { authorization: `Bearer ${jwt}` };
  }

  async function call<T>(name: 'verify' | 'settle', payload: PaymentPayload, requirements: PaymentRequirements): Promise<T> {
    const path = `${new URL(base).pathname.replace(/\/$/, '')}/${name}`;
    const res = await fetch(`${base}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader('POST', path)) },
      body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: requirements }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`facilitator ${name} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  return {
    verify: (payload: PaymentPayload, requirements: PaymentRequirements) => call<VerifyResponse>('verify', payload, requirements),
    settle: (payload: PaymentPayload, requirements: PaymentRequirements) => call<SettleResponse>('settle', payload, requirements),
  };
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Configuration from the environment; absent means x402 is off. */
export function x402Config(
  env: { X402_NETWORK?: string; X402_FACILITATOR_URL?: string; CDP_API_KEY_ID?: string; CDP_API_KEY_SECRET?: string },
  opts: { livemode?: boolean } = {},
): { network: Network; facilitator: FacilitatorConfig } | null {
  // Stripe's sandbox deposit addresses live on Base Sepolia, so test mode defaults there.
  const network = env.X402_NETWORK ?? (opts.livemode === false ? 'eip155:84532' : 'eip155:8453');
  if (!isNetwork(network)) return null;
  const cdp = env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET ? { keyId: env.CDP_API_KEY_ID, keySecret: env.CDP_API_KEY_SECRET } : undefined;
  const url = env.X402_FACILITATOR_URL ?? (cdp ? 'https://api.cdp.coinbase.com/platform/v2/x402' : network === 'eip155:84532' ? 'https://x402.org/facilitator' : 'https://facilitator.payai.network');
  return { network, facilitator: { url, cdp } };
}
