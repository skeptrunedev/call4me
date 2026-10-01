/**
 * Meta (Facebook and Instagram ads): the Meta Pixel on pages (views/layout.tsx) and, for what
 * happens off the page (sign-ups, purchases, calls placed by agents), the Conversions API
 * (developers.facebook.com/docs/marketing-api/conversions-api).
 *
 * Meta only ever sees the account's internal id, SHA-256 hashed, plus the browser it came from
 * (the _fbp/_fbc cookies, IP address and user agent). Never an email, phone number or name.
 */
import { sha256Hex } from './keys';

/** Graph API version for the Conversions API (developers.facebook.com/docs/graph-api/changelog). */
export const GRAPH_API_VERSION = 'v26.0';

/** The browser an event came from, as Meta identifies it. */
export interface MetaBrowser {
  /** Meta's browser id, the `_fbp` cookie. */
  fbp: string | null;
  /** The ad click that brought the browser here, the `_fbc` cookie. */
  fbc: string | null;
  ip: string | null;
  userAgent: string | null;
  /** The page the event happened on; with the user agent, what makes an event a "website" event. */
  url: string | null;
}

/** Who an event belongs to. Hashed email would join here, if it is ever sent. */
export interface MetaUser {
  /** The account id; sent hashed, as the Pixel hashes the same id in the browser. */
  externalId: string;
}

export interface MetaEvent {
  name: string;
  /** Meta drops a second event with the same name and id, so retries never count twice. */
  id: string;
  /**
   * Where the conversion happened. Unset means "website" when the browser is known and "other"
   * (an agent acting for the account) when it is not.
   */
  actionSource?: 'system_generated';
  customData?: Record<string, string | number>;
}

function cookie(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * The browser behind a request. `_fbp` is "fb.<subdomain index>.<created ms>.<random>" and `_fbc`
 * is "fb.<subdomain index>.<created ms>.<fbclid>". A request that arrives from an ad click before
 * the Pixel has written `_fbc` carries the click as `?fbclid=`; Meta's format is rebuilt from it,
 * with subdomain index 1 and the time it was first seen, and the click id left exactly as given.
 */
export function metaBrowser(url: string, headers: Headers, at = Date.now()): MetaBrowser {
  const cookies = headers.get('cookie');
  const fbp = cookie(cookies, '_fbp');
  const fbc = cookie(cookies, '_fbc');
  const page = new URL(url);
  const fbclid = page.searchParams.get('fbclid');
  return {
    fbp: fbp && /^fb\.\d\.\d+\.\d+$/.test(fbp) ? fbp : null,
    fbc: fbc && /^fb\.\d\.\d+\..+$/.test(fbc) ? fbc : fbclid ? `fb.1.${at}.${fbclid}` : null,
    ip: headers.get('cf-connecting-ip'),
    userAgent: headers.get('user-agent'),
    // The query string can carry checkout and sign-in ids; Meta gets the page alone.
    url: `${page.origin}${page.pathname}`,
  };
}

/**
 * The Conversions API's body for one account's events
 * (developers.facebook.com/docs/marketing-api/conversions-api/parameters).
 */
export async function metaPayload(opts: { user: MetaUser; browser: MetaBrowser | null; events: MetaEvent[]; at?: number }): Promise<Record<string, unknown>> {
  const b = opts.browser;
  const userData = {
    external_id: [await sha256Hex(opts.user.externalId)],
    ...(b?.fbp ? { fbp: b.fbp } : {}),
    ...(b?.fbc ? { fbc: b.fbc } : {}),
    ...(b?.ip ? { client_ip_address: b.ip } : {}),
    ...(b?.userAgent ? { client_user_agent: b.userAgent } : {}),
  };
  // Website events require the user agent and the page.
  const website = b?.userAgent && b.url ? b.url : null;
  const eventTime = Math.floor((opts.at ?? Date.now()) / 1000);
  return {
    data: opts.events.map((e) => ({
      event_name: e.name,
      event_time: eventTime,
      event_id: e.id,
      action_source: e.actionSource ?? (website ? 'website' : 'other'),
      ...(website && !e.actionSource ? { event_source_url: website } : {}),
      user_data: userData,
      ...(e.customData ? { custom_data: e.customData } : {}),
    })),
  };
}

/**
 * Send one account's events to Meta. Unset META_PIXEL_ID or META_CAPI_TOKEN disables it, as in
 * local dev and tests. Never throws: analytics must not fail a payment webhook or a call.
 */
export async function sendMeta(env: Pick<Env, 'META_PIXEL_ID' | 'META_CAPI_TOKEN'>, opts: { user: MetaUser; browser: MetaBrowser | null; events: MetaEvent[] }): Promise<void> {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN || opts.events.length === 0) return;
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(env.META_PIXEL_ID)}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`;
  try {
    const body = JSON.stringify(await metaPayload(opts));
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(3000) });
    if (!res.ok) console.warn('meta send failed', res.status, (await res.text()).slice(0, 300), opts.events.map((e) => e.name).join(','));
  } catch (err) {
    console.warn('meta send failed', String(err));
  }
}
