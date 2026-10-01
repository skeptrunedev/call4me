/**
 * Secrets set with `wrangler secret put` (and .dev.vars locally). They are not in
 * wrangler.jsonc, so `wrangler types` cannot see them in CI; this is their contract.
 */
interface Env {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
  /** Optional AI monitoring write key. Unset disables Raindrop. */
  RAINDROP_WRITE_KEY?: string;
  /** Optional Raindrop project slug; unset uses the write key's default project. */
  RAINDROP_PROJECT_ID?: string;
  /** Optional GA4 Measurement Protocol API secret (the call4me web stream). Unset disables server-side GA events. */
  GA_API_SECRET?: string;
  /**
   * Optional Meta Pixel id. Public, but set with `wrangler secret put` like the rest: `wrangler deploy`
   * replaces plain vars set outside wrangler.jsonc, and an empty var there would type as "". Unset disables the Pixel.
   */
  META_PIXEL_ID?: string;
  /** Optional Conversions API access token for that Pixel (Events Manager → Settings). Unset disables server-side Meta events. */
  META_CAPI_TOKEN?: string;
  /** Optional Meta domain verification code, rendered as <meta name="facebook-domain-verification">. Unset renders nothing. */
  META_DOMAIN_VERIFICATION?: string;
  TELNYX_API_KEY: string;
  /** Base64 Ed25519 public key from the Telnyx portal (API keys → public key), for webhook signatures. */
  TELNYX_PUBLIC_KEY: string;
  /** The Call Control application id: numbers are attached to it and calls are placed through it. */
  TELNYX_CONNECTION_ID: string;
  /** Random secret for signing media stream URLs. The site and the voice Worker share it. */
  STREAM_SECRET: string;
  /** Voice Worker only: the bundle hash it was deployed from (scripts/deploy-voice.sh). */
  VOICE_BUILD?: string;
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
  /** Blog supporter subscription, US cents per month (default 500). Read once: the Stripe price is created on first use and cached. */
  SUPPORTER_PRICE_CENTS?: string;
  /** Comma-separated emails of call4me accounts that may use /admin/blog (newsletter sends, comment moderation) and read paid posts. Unset: nobody. */
  ADMIN_EMAILS?: string;
}
