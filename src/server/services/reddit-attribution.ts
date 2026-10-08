/** Our own acquisition records and a durable Reddit conversion outbox, independent of GA. */
import { decodeRedditTouch, redditPayload, sendReddit, type RedditEvent, type RedditTouch } from '../lib/reddit';
import { now } from '../lib/ids';
import { accounts, type Account } from './accounts';

export type RedditEnv = Pick<Env, 'DB'> & {
  CANONICAL_HOST?: string;
  REDDIT_PIXEL_ID?: string;
  REDDIT_CAPI_TOKEN?: string;
  REDDIT_INTERNAL_EMAILS?: string;
};
const DAY = 86_400_000;
const allowedTouch = (t: RedditTouch | null, at: number) => t && t.at <= at && at - t.at <= 90 * DAY ? t : null;

export function redditAttribution(env: RedditEnv) {
  const db = env.DB;
  const internal = new Set((env.REDDIT_INTERNAL_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

  async function visit(touch: RedditTouch, accountId: string | null = null): Promise<void> {
    await db.prepare(`INSERT INTO reddit_visits
      (id, visitor_id, account_id, click_id, campaign, ad_group, ad_id, audience, creative, landing, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET account_id = COALESCE(reddit_visits.account_id, excluded.account_id)`)
      .bind(touch.id, touch.visitorId, accountId, touch.clickId, touch.campaign, touch.adGroup, touch.adId, touch.audience, touch.creative, touch.landing, touch.at).run();
  }

  async function associate(account: Account, from: RedditTouch | null): Promise<RedditTouch | null> {
    if (internal.has(account.email.toLowerCase())) return null;
    const touch = allowedTouch(from, now());
    if (touch) {
      await visit(touch, account.id);
      const encoded = JSON.stringify(touch);
      // A pre-existing paying account is reengagement, not a newly acquired customer.
      await db.prepare(`UPDATE accounts SET reddit_attribution = ?1 WHERE id = ?2 AND reddit_attribution IS NULL
        AND NOT EXISTS (SELECT 1 FROM topups WHERE account_id = ?2 AND paid_at < ?3 AND (paid_amount_cents IS NULL OR paid_amount_cents > 0))
        AND NOT EXISTS (SELECT 1 FROM reddit_payments WHERE account_id = ?2 AND paid_at < ?3 AND paid_amount_cents > 0)
        AND NOT EXISTS (SELECT 1 FROM ledger l WHERE account_id = ?2 AND kind IN ('topup', 'reload') AND created_at < ?3
          AND NOT EXISTS (SELECT 1 FROM reddit_payments p WHERE p.account_id = l.account_id AND p.paid_amount_cents = 0
            AND (l.ref = 'stripe:' || p.id OR l.ref = 'invoice:' || p.id)))`)
        .bind(encoded, account.id, touch.at).run();
      await db.prepare(`UPDATE accounts SET reddit_last_touch = ?1 WHERE id = ?2
        AND (reddit_last_touch IS NULL OR COALESCE(json_extract(reddit_last_touch, '$.at'), 0) <= ?3)`)
        .bind(encoded, account.id, touch.at).run();
      // Link earlier anonymous visits from this browser without taking visits owned by another account.
      await db.prepare(`UPDATE reddit_visits SET account_id = ? WHERE visitor_id = ? AND account_id IS NULL`).bind(account.id, touch.visitorId).run();
    }
    const row = await db.prepare(`SELECT reddit_last_touch, reddit_attribution FROM accounts WHERE id = ?`).bind(account.id)
      .first<{ reddit_last_touch: string | null; reddit_attribution: string | null }>();
    return allowedTouch(decodeRedditTouch(row?.reddit_last_touch ?? row?.reddit_attribution), now());
  }

  async function enqueue(account: Account, touch: RedditTouch | null, event: RedditEvent): Promise<void> {
    if (!touch || internal.has(account.email.toLowerCase())) return;
    const payload = await redditPayload({ accountId: account.id, touch, events: [event] });
    await db.prepare(`INSERT OR IGNORE INTO reddit_events
      (id, account_id, event_name, payload, created_at, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(event.id, account.id, event.name ?? event.type, JSON.stringify(payload), event.at, now()).run();
  }

  async function seen(account: Account, from: RedditTouch | null): Promise<void> {
    // Don't query the attribution tables for an unrelated visit or an old unit-test fixture.
    if (!from && !account.reddit_last_touch && !account.reddit_attribution) return;
    const touch = await associate(account, from);
    if (touch && account.created_at >= touch.at) {
      await enqueue(account, touch, { id: `signup:${account.id}`, at: account.created_at, type: 'SIGN_UP', actionSource: 'WEBSITE', url: env.CANONICAL_HOST ? `https://${env.CANONICAL_HOST}/login` : undefined });
    }
  }

  async function purchase(account: Account, opts: { transactionId: string; cents: number; reload: boolean; from?: RedditTouch | null; at?: number }): Promise<void> {
    const at = opts.at ?? now();
    await db.prepare(`INSERT OR IGNORE INTO reddit_payments (id, account_id, paid_at, paid_amount_cents, kind) VALUES (?, ?, ?, ?, ?)`)
      .bind(opts.transactionId, account.id, at, opts.cents, opts.reload ? 'reload' : 'checkout').run();
    if (!opts.from && !account.reddit_last_touch && !account.reddit_attribution) return;
    const touch = await associate(account, opts.from ?? null);
    await seen(account, touch);
    const source = opts.reload ? 'OTHER' as const : 'WEBSITE' as const;
    const url = opts.reload || !env.CANONICAL_HOST ? undefined : `https://${env.CANONICAL_HOST}/welcome`;
    await enqueue(account, touch, { id: `purchase:${opts.transactionId}`, at, type: 'PURCHASE', value: opts.cents / 100, currency: 'USD', actionSource: source, url });
    if (opts.cents <= 0) return;
    const earlier = await db.prepare(`SELECT 1 FROM reddit_payments WHERE account_id = ?1 AND id != ?2
        AND paid_amount_cents > 0 AND (paid_at < ?4 OR (paid_at = ?4 AND id < ?2))
      UNION ALL SELECT 1 FROM topups WHERE account_id = ?1 AND paid_at IS NOT NULL AND stripe_session_id != ?2 AND paid_at < ?4
        AND (paid_amount_cents IS NULL OR paid_amount_cents > 0)
      UNION ALL SELECT 1 FROM ledger l WHERE account_id = ?1 AND kind IN ('topup', 'reload') AND created_at < ?3
        AND NOT EXISTS (SELECT 1 FROM reddit_payments p WHERE p.account_id = l.account_id AND p.paid_amount_cents = 0
          AND (l.ref = 'stripe:' || p.id OR l.ref = 'invoice:' || p.id)) LIMIT 1`)
      .bind(account.id, opts.transactionId, touch?.at ?? at, at).first();
    await enqueue(account, touch, {
      id: earlier ? `repeat-payment:${opts.transactionId}` : `first-payment:${account.id}`, at, type: 'CUSTOM',
      name: earlier ? 'RepeatDeposit' : 'FirstPayment', value: opts.cents / 100, currency: 'USD', actionSource: source, url,
    });
  }

  async function callCompleted(account: Account, callId: string): Promise<void> {
    if (!account.reddit_last_touch && !account.reddit_attribution) return;
    const call = await db.prepare(`SELECT direction, status, billed_seconds, ended_at FROM calls WHERE id = ? AND account_id = ?`)
      .bind(callId, account.id).first<{ direction: string; status: string; billed_seconds: number | null; ended_at: number | null }>();
    if (!call || call.direction !== 'outbound' || call.status !== 'completed' || !call.billed_seconds || !call.ended_at) return;
    const touch = await associate(account, null);
    if (!touch || call.ended_at < touch.at) return;
    const first = await db.prepare(`SELECT id FROM calls WHERE account_id = ? AND direction = 'outbound' AND status = 'completed'
      AND billed_seconds > 0 ORDER BY ended_at, id LIMIT 1`).bind(account.id).first<{ id: string }>();
    if (first?.id === callId) await enqueue(account, touch, { id: `first-call:${account.id}`, at: call.ended_at, type: 'CUSTOM', name: 'FirstCompletedCall', actionSource: 'OTHER' });
    const days = await db.prepare(`SELECT COUNT(DISTINCT date(ended_at / 1000, 'unixepoch')) AS n FROM calls
      WHERE account_id = ? AND direction = 'outbound' AND status = 'completed' AND billed_seconds > 0`).bind(account.id).first<{ n: number }>();
    if ((days?.n ?? 0) >= 2) await enqueue(account, touch, { id: `returning-caller:${account.id}`, at: call.ended_at, type: 'CUSTOM', name: 'ReturningCaller', actionSource: 'OTHER' });
  }

  return { visit, associate, seen, purchase, callCompleted };
}

/** A short lease prevents overlapping cron ticks from delivering the same pending event. */
export async function deliverReddit(env: RedditEnv, at = now()): Promise<{ delivered: number; failed: number; pending: boolean }> {
  await env.DB.prepare(`INSERT INTO reddit_delivery_status (id, configured, checked_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET configured = excluded.configured, checked_at = excluded.checked_at`)
    .bind(env.REDDIT_PIXEL_ID && env.REDDIT_CAPI_TOKEN ? 1 : 0, at).run();
  if (!env.REDDIT_PIXEL_ID || !env.REDDIT_CAPI_TOKEN) return { delivered: 0, failed: 0, pending: true };
  const db = env.DB;
  const { results } = await db.prepare(`SELECT id FROM reddit_events WHERE state IN ('pending', 'sending') AND next_attempt_at <= ? ORDER BY created_at LIMIT 40`).bind(at).all<{ id: string }>();
  let delivered = 0, failed = 0;
  for (const { id } of results) {
    const event = await db.prepare(`UPDATE reddit_events SET state = 'sending', next_attempt_at = ?, attempts = attempts + 1
      WHERE id = ? AND state IN ('pending', 'sending') AND next_attempt_at <= ? RETURNING payload, created_at, attempts`)
      .bind(at + 180_000, id, at).first<{ payload: string; created_at: number; attempts: number }>();
    if (!event) continue;
    if (at - event.created_at > 7 * DAY) {
      await db.prepare(`UPDATE reddit_events SET state = 'failed', last_error = 'expired' WHERE id = ?`).bind(id).run();
      failed++;
      continue;
    }
    const result = await sendReddit(env, JSON.parse(event.payload) as Record<string, unknown>);
    const state = result.ok ? 'delivered' : result.retryable ? 'pending' : 'failed';
    const delay = Math.min(3_600_000, 60_000 * 2 ** Math.min(event.attempts - 1, 6));
    await db.prepare(`UPDATE reddit_events SET state = ?, delivered_at = ?, last_status = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`)
      .bind(state, result.ok ? at : null, result.status, result.ok ? null : result.status ? `http_${result.status}` : 'network', at + delay, id).run();
    if (result.ok) delivered++; else failed++;
  }
  return { delivered, failed, pending: false };
}

/** Recover interrupted webhook work from confirmed payments and connected calls, without
 * touching money or call state. Only recent attributable records are eligible for CAPI. */
export async function reconcileReddit(env: RedditEnv, at = now()): Promise<void> {
  const service = redditAttribution(env);
  const { results: payments } = await env.DB.prepare(`SELECT p.id, p.account_id, p.paid_at, p.paid_amount_cents, p.kind, t.reddit_attribution AS touch
    FROM reddit_payments p JOIN accounts a ON a.id = p.account_id LEFT JOIN topups t ON t.stripe_session_id = p.id
    WHERE p.paid_at >= ? AND (a.reddit_last_touch IS NOT NULL OR t.reddit_attribution IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM reddit_events e WHERE e.id = 'purchase:' || p.id)
    ORDER BY p.paid_at, p.id LIMIT 40`).bind(at - 7 * DAY)
    .all<{ id: string; account_id: string; paid_at: number; paid_amount_cents: number; kind: string; touch: string | null }>();
  for (const payment of payments) {
    const account = await accounts(env.DB).byId(payment.account_id);
    if (account) await service.purchase(account, { transactionId: payment.id, cents: payment.paid_amount_cents, reload: payment.kind === 'reload', at: payment.paid_at, from: decodeRedditTouch(payment.touch) });
  }
  const { results: connected } = await env.DB.prepare(`SELECT c.id, c.account_id FROM calls c JOIN accounts a ON a.id = c.account_id
    WHERE a.reddit_last_touch IS NOT NULL AND c.direction = 'outbound' AND c.status = 'completed'
      AND c.billed_seconds > 0 AND c.ended_at >= ?
      AND COALESCE(json_extract(a.reddit_last_touch, '$.at'), 0) <= c.ended_at
      AND ((NOT EXISTS (SELECT 1 FROM reddit_events e WHERE e.id = 'first-call:' || c.account_id)
        AND c.id = (SELECT f.id FROM calls f WHERE f.account_id = c.account_id AND f.direction = 'outbound'
          AND f.status = 'completed' AND f.billed_seconds > 0 ORDER BY f.ended_at, f.id LIMIT 1))
        OR (NOT EXISTS (SELECT 1 FROM reddit_events e WHERE e.id = 'returning-caller:' || c.account_id)
          AND (SELECT COUNT(DISTINCT date(r.ended_at / 1000, 'unixepoch')) FROM calls r WHERE r.account_id = c.account_id
            AND r.direction = 'outbound' AND r.status = 'completed' AND r.billed_seconds > 0) >= 2))
    ORDER BY c.ended_at, c.id LIMIT 40`).bind(at - 7 * DAY).all<{ id: string; account_id: string }>();
  for (const call of connected) {
    const account = await accounts(env.DB).byId(call.account_id);
    if (account) await service.callCompleted(account, call.id);
  }
}
