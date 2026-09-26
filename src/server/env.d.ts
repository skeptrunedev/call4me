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
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  EMAIL_FROM: string;
}
