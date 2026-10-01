/**
 * Where a visitor first came from, recorded by us rather than by GA: gtag never runs for the
 * many developers who block it, and agents place calls with no browser at all. The site sets a
 * first-party cookie on the first page a browser loads; checkouts and accounts keep its value,
 * and every GA event an account sends carries it (services/analytics.ts).
 */

export interface FirstTouch {
  /** utm_source or ref, else the referring site ("google", "chatgpt.com", "x"), else "(direct)". */
  source: string;
  /** utm_medium, else what the referring site is: organic, ai, social, referral, or (none). */
  medium: string;
  campaign: string | null;
  /** The path of the first page, without its query string. */
  landing: string;
  /** Epoch ms of the first page view. */
  at: number;
}

export const FIRST_TOUCH_COOKIE = 'c4_ft';
const MAX_AGE = 60 * 60 * 24 * 365;

/** Search engines, keyed by hostname suffix, and the source they report as. */
const SEARCH: [string, string][] = [
  ['google.', 'google'],
  ['bing.com', 'bing'],
  ['duckduckgo.com', 'duckduckgo'],
  ['search.yahoo.com', 'yahoo'],
  ['yandex.', 'yandex'],
  ['ecosia.org', 'ecosia'],
  ['search.brave.com', 'brave'],
  ['kagi.com', 'kagi'],
  ['baidu.com', 'baidu'],
  ['naver.com', 'naver'],
];

/** AI assistants: the GEO channel. Checked before search, since gemini lives on google.com. */
const AI: [string, string][] = [
  ['chatgpt.com', 'chatgpt.com'],
  ['chat.openai.com', 'chatgpt.com'],
  ['perplexity.ai', 'perplexity.ai'],
  ['claude.ai', 'claude.ai'],
  ['gemini.google.com', 'gemini.google.com'],
  ['copilot.microsoft.com', 'copilot.microsoft.com'],
  ['grok.com', 'grok.com'],
  ['chat.deepseek.com', 'chat.deepseek.com'],
  ['chat.mistral.ai', 'chat.mistral.ai'],
  ['you.com', 'you.com'],
  ['phind.com', 'phind.com'],
  ['meta.ai', 'meta.ai'],
];

const SOCIAL: [string, string][] = [
  ['t.co', 'x'],
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['news.ycombinator.com', 'hackernews'],
  ['reddit.com', 'reddit'],
  ['linkedin.com', 'linkedin'],
  ['lnkd.in', 'linkedin'],
  ['youtube.com', 'youtube'],
  ['facebook.com', 'facebook'],
  ['instagram.com', 'instagram'],
  ['threads.net', 'threads'],
  ['bsky.app', 'bluesky'],
  ['github.com', 'github'],
  ['producthunt.com', 'producthunt'],
];

/** Sites a visitor passes through mid-flow (payment, sign-in): they say nothing about the source. */
const PASS_THROUGH = ['checkout.stripe.com', 'accounts.google.com', 'api.x.com', 'api.twitter.com'];

const matches = (host: string, suffix: string) => (suffix.endsWith('.') ? host.startsWith(suffix) || host.includes(`.${suffix}`) : host === suffix || host.endsWith(`.${suffix}`));
const lookup = (host: string, table: [string, string][]) => table.find(([suffix]) => matches(host, suffix))?.[1] ?? null;

/** What kind of site a source or referring host is, for when utm_medium does not say. */
function classify(host: string): { source: string; medium: string } {
  const h = host.toLowerCase().replace(/^www\./, '');
  const ai = lookup(h, AI);
  if (ai) return { source: ai, medium: 'ai' };
  const search = lookup(h, SEARCH);
  if (search) return { source: search, medium: 'organic' };
  const social = lookup(h, SOCIAL);
  if (social) return { source: social, medium: 'social' };
  return { source: h, medium: 'referral' };
}

const clip = (s: string, max = 100) => s.trim().slice(0, max);

/**
 * The first touch for a page request: its utm tags or ?ref=, else its referrer, else direct.
 * Null when the referrer is this site or a payment or sign-in page, which only happens to a
 * browser that is mid-flow (and so says nothing about where it came from).
 */
export function firstTouchOf(url: URL, referrer: string | null | undefined, at = Date.now()): FirstTouch | null {
  const q = url.searchParams;
  const landing = clip(url.pathname, 200);
  const campaign = q.get('utm_campaign') ? clip(q.get('utm_campaign')!) : null;
  const tagged = q.get('utm_source') ?? q.get('ref');
  if (tagged?.trim()) {
    // A known site keeps its usual name and kind ("utm_source=chatgpt.com" is the ai channel).
    const known = classify(tagged);
    return { source: clip(known.source), medium: clip(q.get('utm_medium')?.trim() || known.medium), campaign, landing, at };
  }
  let host: string | null = null;
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : null;
  } catch {
    host = null;
  }
  if (host === url.hostname || (host && PASS_THROUGH.some((p) => matches(host, p)))) return null;
  if (!host) return { source: '(direct)', medium: '(none)', campaign, landing, at };
  return { ...classify(host), campaign, landing, at };
}

/** The cookie's value: the first touch as URI-encoded JSON. */
export const encodeFirstTouch = (t: FirstTouch): string => encodeURIComponent(JSON.stringify(t));

/** A stored first touch (the cookie, or an accounts/topups column), or null if absent or malformed. */
export function decodeFirstTouch(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw.startsWith('{') ? raw : decodeURIComponent(raw)) as Partial<FirstTouch>;
    if (typeof t.source !== 'string' || typeof t.medium !== 'string' || typeof t.landing !== 'string' || typeof t.at !== 'number') return null;
    return { source: t.source, medium: t.medium, campaign: typeof t.campaign === 'string' ? t.campaign : null, landing: t.landing, at: t.at };
  } catch {
    return null;
  }
}

/** The first touch this request's browser carries. */
export function firstTouchCookie(cookieHeader: string | null | undefined): FirstTouch | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === FIRST_TOUCH_COOKIE) return decodeFirstTouch(part.slice(eq + 1).trim());
  }
  return null;
}

export const firstTouchSetCookie = (t: FirstTouch): string => `${FIRST_TOUCH_COOKIE}=${encodeFirstTouch(t)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;

/**
 * GA user properties for a first touch (developers.google.com/analytics/devguides/collection/protocol/ga4/user-properties):
 * names up to 24 characters, values up to 36.
 */
export function firstTouchUserProperties(t: FirstTouch): Record<string, string> {
  const props: Record<string, string> = { first_source: t.source, first_medium: t.medium, first_landing: t.landing };
  if (t.campaign) props.first_campaign = t.campaign;
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.slice(0, 36)]));
}
