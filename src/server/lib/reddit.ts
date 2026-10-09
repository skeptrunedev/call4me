/** Reddit Ads first-party visit capture, Pixel events, and Conversions API v3. */
import { sha256Hex } from './keys';
import { now } from './ids';
import { realEmail } from './auth-options';
import type { Account } from '../services/accounts';

import { type RedditEvent, type RedditVisit } from './reddit-visit';
export { REDDIT_VISITOR_COOKIE, REDDIT_VISIT_COOKIE, redditVisitOf, redditVisitCookie, redditCookies, saveRedditVisit, type RedditVisit, type RedditEvent, type RedditPixelEvent } from './reddit-visit';

/** Attach a paid visit while preserving the account's original paid acquisition. */
export async function attachRedditVisit(db: D1Database, accountId: string, visitId: string): Promise<void> {
  await db.prepare(`UPDATE reddit_visits SET account_id = COALESCE(account_id, ?) WHERE id = ?`).bind(accountId, visitId).run();
  await db.prepare(`UPDATE accounts SET reddit_first_visit_id = COALESCE(reddit_first_visit_id, ?), reddit_last_visit_id = ? WHERE id = ?`).bind(visitId, visitId, accountId).run();
}

export async function redditEmailHash(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  const local = normalized.slice(0, at).replace(/\./g, '').split('+')[0];
  return sha256Hex(`${local}@${normalized.slice(at + 1)}`);
}

async function visitFor(db: D1Database, account: Account, visitId?: string | null): Promise<RedditVisit | null> {
  const id = visitId ?? account.reddit_last_visit_id ?? account.reddit_first_visit_id;
  return id ? db.prepare(`SELECT * FROM reddit_visits WHERE id = ?`).bind(id).first<RedditVisit>() : null;
}

/** Build the exact event persisted for audit/retry. It intentionally has no call/task details. */
export async function redditPayload(db: D1Database, account: Account, event: RedditEvent, visitId?: string | null): Promise<Record<string, unknown>> {
  const visit = await visitFor(db, account, visitId);
  const real = realEmail(account.email);
  const website = event.website !== false && visit?.user_agent && visit.landing;
  const metadata: Record<string, unknown> = { conversion_id: event.conversionId };
  if (event.trackingType === 'PURCHASE') Object.assign(metadata, { currency: 'USD', value: event.value, item_count: 1 });
  return {
    event_at: event.at,
    action_source: website ? 'WEBSITE' : 'OTHER',
    ...(website ? { event_source_url: `https://call4.me${visit!.landing}${visit?.rdt_cid ? `?rdt_cid=${encodeURIComponent(visit.rdt_cid)}` : ''}` } : {}),
    type: { tracking_type: event.trackingType, ...(event.trackingType === 'CUSTOM' ? { custom_event_name: event.customEventName } : {}) },
    ...(visit?.rdt_cid ? { click_id: visit.rdt_cid } : {}),
    metadata,
    user: {
      external_id: await sha256Hex(account.id),
      ...(real ? { email: await redditEmailHash(real) } : {}),
      ...(website && visit?.ip_address ? { ip_address: visit.ip_address } : {}),
      ...(website && visit?.user_agent ? { user_agent: visit.user_agent } : {}),
    },
  };
}

/**
 * Call4Me's visitor id is an internal attribution key, not Reddit's Pixel/device UUID.
 * Strip the old, invalid mapping while delivering so persisted retries created before
 * this fix are repaired as well as newly queued conversions.
 */
function payloadForDelivery(payload: string): Record<string, unknown> {
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  if (parsed.user && typeof parsed.user === 'object' && !Array.isArray(parsed.user)) delete (parsed.user as Record<string, unknown>).uuid;
  return parsed;
}

type RedditEnv = Pick<Env, 'DB' | 'REDDIT_PIXEL_ID' | 'REDDIT_CAPI_TOKEN' | 'REDDIT_TEST_ID'>;

export function redditConversions(env: RedditEnv) {
  const configured = Boolean(env.REDDIT_PIXEL_ID && env.REDDIT_CAPI_TOKEN);

  async function deliver(conversionId: string): Promise<void> {
    const row = await env.DB.prepare(`SELECT payload FROM reddit_conversions WHERE conversion_id = ? AND status != 'sent'`).bind(conversionId).first<{ payload: string }>();
    if (!row) return;
    if (!configured) {
      await env.DB.prepare(`UPDATE reddit_conversions SET status = 'blocked', last_error = ? WHERE conversion_id = ?`).bind('REDDIT_PIXEL_ID or REDDIT_CAPI_TOKEN is not configured', conversionId).run();
      return;
    }
    const body = JSON.stringify({ data: { ...(env.REDDIT_TEST_ID ? { test_id: env.REDDIT_TEST_ID } : {}), events: [payloadForDelivery(row.payload)] } });
    let status: number | null = null;
    let response = '';
    let error: string | null = null;
    try {
      const res = await fetch(`https://ads-api.reddit.com/api/v3/pixels/${encodeURIComponent(env.REDDIT_PIXEL_ID!)}/conversion_events`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.REDDIT_CAPI_TOKEN}`, 'content-type': 'application/json', 'user-agent': 'call4me-reddit-capi/1.0' },
        body,
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      response = (await res.text()).slice(0, 1000);
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = String(err).slice(0, 500);
    }
    await env.DB
      .prepare(
        `UPDATE reddit_conversions SET status = ?, attempts = attempts + 1, last_http_status = ?, last_error = ?, last_response = ?, last_attempt_at = ?, delivered_at = CASE WHEN ? = 'sent' THEN ? ELSE delivered_at END WHERE conversion_id = ?`,
      )
      .bind(error ? 'failed' : 'sent', status, error, response || null, now(), error ? 'failed' : 'sent', now(), conversionId)
      .run();
    if (error) console.warn('reddit capi send failed', conversionId, error, response.slice(0, 300));
  }

  return {
    configured,
    async queue(account: Account, event: RedditEvent, visitId?: string | null): Promise<void> {
      const payload = await redditPayload(env.DB, account, event, visitId);
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO reddit_conversions (conversion_id, account_id, visit_id, event_name, source_ref, event_at, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(event.conversionId, account.id, visitId ?? account.reddit_last_visit_id ?? account.reddit_first_visit_id, event.trackingType === 'CUSTOM' ? event.customEventName : event.trackingType, event.sourceRef, event.at, JSON.stringify(payload), now())
        .run();
      await deliver(event.conversionId);
    },
    deliver,
    async flush(limit = 50): Promise<number> {
      const { results } = await env.DB.prepare(`SELECT conversion_id FROM reddit_conversions WHERE status IN ('pending','failed','blocked') AND attempts < 8 ORDER BY event_at LIMIT ?`).bind(limit).all<{ conversion_id: string }>();
      for (const row of results) await deliver(row.conversion_id);
      return results.length;
    },
  };
}
