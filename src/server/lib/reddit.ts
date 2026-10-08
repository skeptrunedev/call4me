/** Reddit attribution: public website visits use the Pixel; verified account events use CAPI v3. */
import { sha256Hex } from './keys';

const TOUCH_COOKIE = 'c4_reddit';
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MAX_AGE_MS = MAX_AGE_SECONDS * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RedditTouch {
  id: string;
  visitorId: string;
  clickId: string | null;
  uuid: string | null;
  campaign: string | null;
  adGroup: string | null;
  adId: string | null;
  audience: string | null;
  creative: string | null;
  landing: string;
  at: number;
}

export interface RedditEvent {
  id: string;
  /** Unix milliseconds, not seconds. */
  at: number;
  type: 'SIGN_UP' | 'PURCHASE' | 'CUSTOM';
  name?: string;
  /** Base currency units, not cents. */
  value?: number;
  currency?: string;
  actionSource?: 'WEBSITE' | 'OTHER';
  url?: string;
}

function cookies(header: string | null | undefined, name: string): string[] {
  return (header ?? '').split(';').flatMap((part) => {
    const eq = part.indexOf('=');
    return eq > 0 && part.slice(0, eq).trim() === name ? [part.slice(eq + 1).trim()] : [];
  });
}

function bounded(value: unknown, max = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && ![...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
}

function field(value: string | null): string | null {
  return bounded(value) ? value : null;
}

function click(value: unknown): value is string {
  return bounded(value, 512) && /^[a-z0-9._~-]+$/i.test(value);
}

function cleanUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const clean = `${url.origin}${url.pathname}`;
    return bounded(clean, 512) ? clean : null;
  } catch {
    return null;
  }
}

/** A bounded, encoded JSON cookie. It carries attribution only and is never an identity credential. */
export function encodeRedditTouch(touch: RedditTouch): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(touch)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeRedditTouch(value: string | null | undefined, at = Date.now()): RedditTouch | null {
  if (!value || value.length > 3800) return null;
  try {
    const raw = value.trim();
    if (!raw.startsWith('{') && !/^[a-z0-9_-]+$/i.test(raw)) return null;
    const json: unknown = JSON.parse(raw.startsWith('{') ? raw : new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))));
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
    const t = json as Record<string, unknown>;
    if (typeof t.id !== 'string' || !UUID.test(t.id) || typeof t.visitorId !== 'string' || !UUID.test(t.visitorId)) return null;
    if (!Number.isSafeInteger(t.at) || (t.at as number) > at || at - (t.at as number) > MAX_AGE_MS) return null;
    if (t.clickId !== null && !click(t.clickId)) return null;
    if (t.uuid !== null && (typeof t.uuid !== 'string' || !UUID.test(t.uuid))) return null;
    for (const name of ['campaign', 'adGroup', 'adId', 'audience', 'creative']) {
      if (t[name] !== null && !bounded(t[name])) return null;
    }
    if (typeof t.landing !== 'string' || cleanUrl(t.landing) !== t.landing) return null;
    // Explicitly select fields: unknown cookie properties must not propagate into storage or CAPI.
    return {
      id: t.id, visitorId: t.visitorId, clickId: t.clickId as string | null, uuid: t.uuid as string | null,
      campaign: t.campaign as string | null, adGroup: t.adGroup as string | null, adId: t.adId as string | null,
      audience: t.audience as string | null, creative: t.creative as string | null, landing: t.landing, at: t.at as number,
    };
  } catch {
    return null;
  }
}

export function redditTouchCookie(header: string | null | undefined, at = Date.now()): RedditTouch | null {
  return decodeRedditTouch(cookies(header, TOUCH_COOKIE)[0], at);
}

/** Mirrors Reddit's official server GTM template: select the oldest timestamp and send its UUID. */
function browserUuid(header: string | null, at: number): string | null {
  const valid = cookies(header, '_rdt_uuid').flatMap((value) => {
    const parts = value.split('.');
    if (parts.length !== 2 || !/^\d{13}$/.test(parts[0]) || !UUID.test(parts[1])) return [];
    const timestamp = Number(parts[0]);
    return timestamp <= at && at - timestamp <= MAX_AGE_MS ? [{ timestamp, uuid: parts[1] }] : [];
  });
  valid.sort((a, b) => a.timestamp - b.timestamp);
  return valid[0]?.uuid ?? null;
}

/** Creates a paid Reddit touch, or retains the existing touch on an ordinary subsequent visit. */
export function redditTouchOf(url: URL, headers: Headers, at = Date.now()): RedditTouch | null {
  const header = headers.get('cookie');
  const previous = redditTouchCookie(header, at);
  const uuid = browserUuid(header, at) ?? previous?.uuid ?? null;
  const rawClick = url.searchParams.get('rdt_cid');
  const clickId = click(rawClick) ? rawClick : null;
  const paid = url.searchParams.get('utm_source')?.toLowerCase() === 'reddit' && ['paid_social', 'cpc', 'paid'].includes(url.searchParams.get('utm_medium')?.toLowerCase() ?? '');
  if (!clickId && !paid) return previous ? { ...previous, uuid } : null;
  // Reloads of the same click preserve its original timestamp and event id.
  if (clickId && clickId === previous?.clickId) return { ...previous, uuid };
  const landing = cleanUrl(url.href);
  if (!landing) return previous;
  const labels = {
    campaign: field(url.searchParams.get('campaign_id')) ?? field(url.searchParams.get('utm_campaign')),
    adGroup: field(url.searchParams.get('adgroup_id')), adId: field(url.searchParams.get('ad_id')),
    audience: field(url.searchParams.get('utm_term')), creative: field(url.searchParams.get('utm_content')),
  };
  if (!clickId && previous?.clickId === null && previous.landing === landing && Object.entries(labels).every(([key, value]) => previous[key as keyof typeof labels] === value)) return { ...previous, uuid };
  return {
    id: crypto.randomUUID(), visitorId: previous?.visitorId ?? crypto.randomUUID(), clickId, uuid,
    ...labels, landing, at,
  };
}

export function redditTouchSetCookie(touch: RedditTouch): string {
  const encoded = encodeRedditTouch(touch);
  if (encoded.length > 3800) throw new RangeError('Reddit attribution cookie exceeds its size limit');
  return `${TOUCH_COOKIE}=${encoded}; Path=/; Max-Age=${MAX_AGE_SECONDS}; Secure; HttpOnly; SameSite=Lax`;
}

/**
 * Only inject on public marketing pages, after capturing attribution on the server. externalId
 * is already SHA-256 hashed by the caller, matching CAPI. No conversion events are emitted here.
 * Keep account-level AAM and automatic event setup disabled in Reddit Events Manager. The Pixel
 * is third-party code; this wrapper does not guarantee that it cannot inspect page content.
 */
export function redditPixelScript(pixelId: string, externalId: string | null): string {
  if (!/^(?:t2|a2|p2)_[a-z0-9]+$/.test(pixelId)) return '';
  const match = externalId && /^[a-f0-9]{64}$/.test(externalId) ? { externalId } : {};
  return `(function(){
var click=new URLSearchParams(location.search).get('rdt_cid');
if(click&&click.length<=512&&/^[a-z0-9._~-]+$/i.test(click))document.cookie='_rdt_cid='+click+'; Path=/; Max-Age=${MAX_AGE_SECONDS}; Secure; SameSite=Lax';
var clean=location.origin+location.pathname;
try{history.replaceState(history.state,'',clean);}catch(e){return;}
if(window.rdt)return;
var rdt=window.rdt=function(){rdt.sendEvent?rdt.sendEvent.apply(rdt,arguments):rdt.callQueue.push(arguments);};
rdt.callQueue=[];
rdt('init',${JSON.stringify(pixelId)},${JSON.stringify(match)});
rdt('track','PageVisit');
var s=document.createElement('script');s.async=true;s.src='https://www.redditstatic.com/ads/pixel.js';
document.head.appendChild(s);
})();`;
}

export async function redditPayload(opts: { accountId: string; touch: RedditTouch | null; events: RedditEvent[] }): Promise<Record<string, unknown>> {
  const externalId = await sha256Hex(opts.accountId);
  return { data: { events: opts.events.map((event) => {
    if (!bounded(event.id, 256) || !Number.isSafeInteger(event.at) || event.at < 1_000_000_000_000) throw new RangeError('Reddit event requires an id and a millisecond timestamp');
    if (event.type === 'CUSTOM' && !bounded(event.name, 64)) throw new RangeError('Reddit custom event requires a bounded name');
    if (event.value !== undefined && (!Number.isFinite(event.value) || event.value < 0)) throw new RangeError('Reddit event value must be nonnegative base currency units');
    if (event.currency !== undefined && !/^[A-Z]{3}$/.test(event.currency)) throw new RangeError('Reddit event currency must be an ISO currency code');
    const url = event.url ? cleanUrl(event.url) : null;
    const actionSource = event.actionSource ?? (url ? 'WEBSITE' : 'OTHER');
    return {
      event_at: event.at, action_source: actionSource,
      type: { tracking_type: event.type, ...(event.type === 'CUSTOM' ? { custom_event_name: event.name } : {}) },
      metadata: { conversion_id: event.id, ...(event.value !== undefined ? { value: event.value } : {}), ...(event.currency ? { currency: event.currency } : {}) },
      user: { external_id: externalId, ...(opts.touch?.uuid ? { uuid: opts.touch.uuid } : {}) },
      ...(opts.touch?.clickId ? { click_id: opts.touch.clickId } : {}),
      ...(actionSource === 'WEBSITE' && url ? { event_source_url: url } : {}),
    };
  }) } };
}

/** No payload, response body, or credential is logged. A delivery ledger owns retries. */
export async function sendReddit(env: { REDDIT_PIXEL_ID?: string; REDDIT_CAPI_TOKEN?: string }, payload: Record<string, unknown>): Promise<{ ok: boolean; retryable: boolean; status: number | null }> {
  if (!env.REDDIT_PIXEL_ID || !env.REDDIT_CAPI_TOKEN) return { ok: false, retryable: false, status: null };
  try {
    const response = await fetch(`https://ads-api.reddit.com/api/v3/pixels/${encodeURIComponent(env.REDDIT_PIXEL_ID)}/conversion_events`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'call4me-reddit-capi', authorization: `Bearer ${env.REDDIT_CAPI_TOKEN}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    return { ok: response.ok, retryable: response.status === 429 || response.status >= 500, status: response.status };
  } catch {
    return { ok: false, retryable: true, status: null };
  }
}
