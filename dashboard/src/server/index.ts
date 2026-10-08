import { Hono } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { computeMetrics } from "./metrics";
import { redditSchemaReady } from "./reddit-schema";
import type { AccountRow, CallRow, LedgerRow, RedditDeliveryRow, RedditDeliveryStatusRow, RedditPaidHistoryRow, RedditPaymentRow, RedditVisitRow, TopupRow } from "../shared/types";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Comma-separated emails allowed in, checked again here behind the Access policy. */
  ALLOWED_EMAILS?: string;
  /** Comma-separated account emails that are ours (founders, reviewers) and left out of every metric. */
  INTERNAL_EMAILS?: string;
}

const list = (value?: string) => new Set((value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

const app = new Hono<{ Bindings: Env; Variables: { email: string } }>();
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

// Cloudflare Access sits in front of dash.call4.me; the Worker verifies its JWT itself so the data is never
// served on a path Access doesn't cover.
app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  const url = new URL(c.req.url);
  if (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    c.set("email", "dev@localhost");
    return next();
  }
  const issuer = c.env.ACCESS_TEAM_DOMAIN;
  const audience = c.env.ACCESS_AUD;
  if (!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience)
    return c.json({ error: "Authentication is not configured" }, 503);
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "Sign in through Cloudflare Access" }, 401);
  try {
    let key = keys.get(issuer);
    if (!key) {
      key = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      keys.set(issuer, key);
    }
    const { payload } = await jwtVerify(token, key, { issuer, audience, algorithms: ["RS256"], requiredClaims: ["exp", "email"] });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!list(c.env.ALLOWED_EMAILS).has(email)) return c.json({ error: "This account isn't allowed in" }, 403);
    c.set("email", email);
  } catch {
    return c.json({ error: "Your session has expired. Sign in again." }, 401);
  }
  if (!["GET", "HEAD"].includes(c.req.method)) return c.json({ error: "Read only" }, 405);
  await next();
});

app.get("/api/metrics", async (c) => {
  const redditReady = await redditSchemaReady(c.env.DB);
  const [accounts, topups, calls, ledger] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT id, email, created_at, reload_status, reload_cents, reload_renews_at${redditReady ? ", reddit_attribution, reddit_last_touch" : ""} FROM accounts`),
    c.env.DB.prepare("SELECT account_id, amount_cents, paid_at, monthly FROM topups WHERE status = 'paid' AND account_id IS NOT NULL"),
    c.env.DB.prepare(
      "SELECT id, account_id, created_at, answered_at, direction, status, billed_seconds, cost_cents, json_extract(outcome, '$.result') AS result FROM calls",
    ),
    c.env.DB.prepare(
      `SELECT account_id, SUM(amount_cents) AS balance_cents,
         SUM(CASE WHEN kind = 'adjustment' THEN amount_cents ELSE 0 END) AS granted_cents,
         SUM(CASE WHEN kind IN ('topup', 'reload') THEN amount_cents ELSE 0 END) AS funded_cents,
         -SUM(CASE WHEN kind IN ('call', 'number', 'refund') THEN amount_cents ELSE 0 END) AS spent_cents
       FROM ledger GROUP BY account_id`,
    ),
  ]);
  const redditRows = redditReady ? await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, visitor_id, account_id, campaign, ad_group, ad_id, audience, creative, at FROM reddit_visits"),
    c.env.DB.prepare("SELECT id, account_id, paid_at, paid_amount_cents, kind FROM reddit_payments"),
    c.env.DB.prepare(`SELECT account_id, paid_at FROM topups
      WHERE account_id IS NOT NULL AND paid_at IS NOT NULL AND (paid_amount_cents IS NULL OR paid_amount_cents > 0)
      UNION ALL SELECT l.account_id, l.created_at AS paid_at FROM ledger l
      WHERE l.kind IN ('topup', 'reload') AND l.amount_cents > 0 AND NOT EXISTS (
        SELECT 1 FROM reddit_payments p WHERE p.paid_amount_cents = 0
        AND (l.ref = 'stripe:' || p.id OR l.ref = 'invoice:' || p.id)
      )`),
    c.env.DB.prepare("SELECT account_id, event_name, state, COUNT(*) AS count FROM reddit_events GROUP BY account_id, event_name, state"),
    c.env.DB.prepare("SELECT configured, checked_at FROM reddit_delivery_status WHERE id = 1"),
  ]) : [];
  return c.json(
    computeMetrics(
      {
        accounts: accounts.results as unknown as AccountRow[],
        topups: topups.results as unknown as TopupRow[],
        calls: calls.results as unknown as CallRow[],
        ledger: ledger.results as unknown as LedgerRow[],
        redditReady,
        redditVisits: redditRows[0]?.results as unknown as RedditVisitRow[] | undefined,
        redditPayments: redditRows[1]?.results as unknown as RedditPaymentRow[] | undefined,
        redditPaidHistory: redditRows[2]?.results as unknown as RedditPaidHistoryRow[] | undefined,
        redditDelivery: redditRows[3]?.results as unknown as RedditDeliveryRow[] | undefined,
        redditDeliveryStatus: redditRows[4]?.results[0] as unknown as RedditDeliveryStatusRow | undefined,
      },
      list(c.env.INTERNAL_EMAILS),
      Date.now(),
    ),
  );
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
