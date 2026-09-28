/**
 * Secrets set with `wrangler secret put` (and .dev.vars locally). They are not in
 * wrangler.jsonc, so `wrangler types` cannot see them in CI; this is their contract.
 */
interface Env {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
  TELNYX_API_KEY: string;
  /** Base64 Ed25519 public key from the Telnyx portal (API keys → public key), for webhook signatures. */
  TELNYX_PUBLIC_KEY: string;
  /** The Call Control application id: numbers are attached to it and calls are placed through it. */
  TELNYX_CONNECTION_ID: string;
  /** Random secret for signing media stream URLs. */
  STREAM_SECRET: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  /** Outbound email (the drip) over SMTP, same Fastmail setup as skillbay. */
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  /** e.g. "Nick K <me@call4.me>" */
  EMAIL_FROM: string;
  /** Ed25519 private JWK (JSON) whose public half is served at /.well-known/http-message-signatures-directory. */
  WEB_BOT_AUTH_KEY?: string;
  /** x402 (GET /api, credits in USDC): CAIP-2 network ("eip155:8453" Base mainnet, default; "eip155:84532" Base Sepolia, default with a Stripe test key). */
  X402_NETWORK?: string;
  /** x402: facilitator base URL; defaults to the CDP facilitator when CDP keys exist, else PayAI (mainnet) or x402.org (Sepolia). */
  X402_FACILITATOR_URL?: string;
  /** Coinbase Developer Platform secret API key id and secret, for the CDP facilitator. */
  CDP_API_KEY_ID?: string;
  CDP_API_KEY_SECRET?: string;
  /** x402: override for the payTo address. Unset means the Stripe crypto deposit address the worker mints and caches. */
  X402_PAY_TO?: string;
}
