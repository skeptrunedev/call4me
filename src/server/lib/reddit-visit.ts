import { newId, now } from './ids';

export const REDDIT_VISITOR_COOKIE = 'c4_rv';
export const REDDIT_VISIT_COOKIE = 'c4_rvisit';
const COOKIE_AGE = 60 * 60 * 24 * 90;

export interface RedditVisit {
  id: string;
  visitor_id: string;
  account_id: string | null;
  rdt_cid: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_group_id: string | null;
  ad_group_name: string | null;
  audience: string | null;
  ad_id: string | null;
  ad_name: string | null;
  creative_id: string | null;
  creative_name: string | null;
  landing: string;
  referrer_host: string | null;
  ip_address: string | null;
  user_agent: string | null;
  visited_at: number;
}

export interface RedditPixelEvent {
  name: 'Purchase' | 'SignUp' | 'Custom';
  conversionId: string;
  customEventName?: string;
  currency?: 'USD';
  value?: number;
  itemCount?: number;
}

export type RedditEvent =
  | { trackingType: 'PURCHASE'; conversionId: string; sourceRef: string; at: number; value: number; website?: boolean }
  | { trackingType: 'SIGN_UP'; conversionId: string; sourceRef: string; at: number; website?: boolean }
  | { trackingType: 'CUSTOM'; customEventName: 'First payment' | 'First completed call' | 'Returning caller' | 'Task resolved'; conversionId: string; sourceRef: string; at: number; website?: boolean };

function cookie(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

const clip = (value: string | null | undefined, max = 200) => {
  const v = value?.trim();
  return v ? v.slice(0, max) : null;
};

const first = (q: URLSearchParams, names: string[]) => {
  for (const name of names) {
    const value = clip(q.get(name));
    if (value) return value;
  }
  return null;
};

/** A new paid Reddit landing, or null for ordinary/referral traffic. */
export function redditVisitOf(url: URL, headers: Headers, at = now()): RedditVisit | null {
  const q = url.searchParams;
  const click = clip(q.get('rdt_cid'), 300);
  const source = q.get('utm_source')?.trim().toLowerCase();
  const medium = q.get('utm_medium')?.trim().toLowerCase();
  const tagged = source === 'reddit' && (!medium || ['paid', 'paid-social', 'paid_social', 'cpc'].includes(medium));
  if (!click && !tagged) return null;
  const existingVisitor = cookie(headers.get('cookie'), REDDIT_VISITOR_COOKIE);
  const referrerHost = (() => {
    try {
      return headers.get('referer') ? new URL(headers.get('referer')!).hostname.slice(0, 200) : null;
    } catch {
      return null;
    }
  })();
  return {
    id: `rv_${newId()}`,
    visitor_id: existingVisitor && /^[a-z0-9_]{8,80}$/.test(existingVisitor) ? existingVisitor : `v_${newId(24)}`,
    account_id: null,
    rdt_cid: click,
    campaign_id: first(q, ['campaign_id', 'utm_id', 'rdt_campaign_id']),
    campaign_name: first(q, ['campaign_name', 'utm_campaign']),
    ad_group_id: first(q, ['ad_group_id', 'adgroup_id', 'rdt_ad_group_id']),
    ad_group_name: first(q, ['ad_group_name', 'adgroup_name']),
    audience: first(q, ['audience', 'utm_term']),
    ad_id: first(q, ['ad_id', 'rdt_ad_id']),
    ad_name: first(q, ['ad_name', 'utm_content']),
    creative_id: first(q, ['creative_id', 'rdt_creative_id']),
    creative_name: first(q, ['creative_name', 'creative']),
    landing: url.pathname.slice(0, 300),
    referrer_host: referrerHost,
    ip_address: clip(headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0], 64),
    user_agent: clip(headers.get('user-agent'), 500),
    visited_at: at,
  };
}

export const redditVisitCookie = (header: string | null | undefined): string | null => {
  const id = cookie(header, REDDIT_VISIT_COOKIE);
  return id && /^rv_[a-z0-9]{16}$/.test(id) ? id : null;
};

export const redditCookies = (visit: RedditVisit): string[] => [
  `${REDDIT_VISITOR_COOKIE}=${visit.visitor_id}; Path=/; Max-Age=${COOKIE_AGE}; HttpOnly; Secure; SameSite=Lax`,
  `${REDDIT_VISIT_COOKIE}=${visit.id}; Path=/; Max-Age=${COOKIE_AGE}; HttpOnly; Secure; SameSite=Lax`,
];


export async function saveRedditVisit(db: D1Database, visit: RedditVisit): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reddit_visits (id, visitor_id, account_id, rdt_cid, campaign_id, campaign_name, ad_group_id, ad_group_name, audience, ad_id, ad_name, creative_id, creative_name, landing, referrer_host, ip_address, user_agent, visited_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(visit.id, visit.visitor_id, visit.account_id, visit.rdt_cid, visit.campaign_id, visit.campaign_name, visit.ad_group_id, visit.ad_group_name, visit.audience, visit.ad_id, visit.ad_name, visit.creative_id, visit.creative_name, visit.landing, visit.referrer_host, visit.ip_address, visit.user_agent, visit.visited_at)
    .run();
}
