/**
 * Google Analytics 4: the call4me property (me@skeptrune.com). Pages load gtag.js (views/layout.tsx);
 * what happens off the page (sign-ups, purchases, calls placed by agents) is sent from here over the
 * Measurement Protocol (developers.google.com/analytics/devguides/collection/protocol/ga4).
 *
 * GA sees the account's internal id as user_id. A real email goes only as GA's user-provided data:
 * normalized and SHA-256 hashed here, never in the clear (Admin → Data collection has it turned on).
 */

import { sha256Hex } from './keys';

export const GA_MEASUREMENT_ID = 'G-YST5YLB3KV';

/** The browser a server-side event belongs to, read from gtag's first-party cookies. */
export interface GaClient {
  clientId: string;
  /** The visit in progress, so the event lands in that session (and its campaign). */
  sessionId: string | null;
}

export type GaParams = Record<string, string | number | boolean>;

export interface GaEvent {
  name: string;
  params?: GaParams;
}

function cookie(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * gtag's client id from `_ga` ("GA1.1.<random>.<first visit>") and the session id from
 * `_ga_<container>`, which is "GS1.1.<session>.…" or, in the newer format, "GS2.1.s<session>$o…".
 */
export function gaClient(cookieHeader: string | null | undefined, measurementId = GA_MEASUREMENT_ID): GaClient | null {
  const ga = cookie(cookieHeader, '_ga')?.match(/^GA\d\.\d+\.(\d+\.\d+)$/);
  if (!ga) return null;
  const session = cookie(cookieHeader, `_ga_${measurementId.replace(/^G-/, '')}`);
  const sessionId = session?.match(/^GS1\.\d+\.(\d+)\./)?.[1] ?? session?.match(/^GS2\.\d+\.s(\d+)/)?.[1] ?? null;
  return { clientId: ga[1], sessionId };
}

/**
 * An email as GA's user-provided data wants it: trimmed, lowercased, spaces removed, dots dropped
 * before @gmail.com and @googlemail.com, then hex SHA-256
 * (developers.google.com/analytics/devguides/collection/ga4/uid-data).
 */
export async function gaEmailHash(email: string): Promise<string> {
  const e = email.trim().toLowerCase().replace(/\s+/g, '');
  const at = e.lastIndexOf('@');
  const domain = e.slice(at + 1);
  const local = domain === 'gmail.com' || domain === 'googlemail.com' ? e.slice(0, at).replace(/\./g, '') : e.slice(0, at);
  return sha256Hex(`${local}@${domain}`);
}

/**
 * Send events for one browser (and account) to GA. Unset GA_API_SECRET disables it, as in
 * local dev and tests. Never throws: analytics must not fail a payment webhook or a call.
 */
export async function sendGa(env: Pick<Env, 'GA_API_SECRET'>, opts: { client: GaClient; userId?: string; emailHash?: string | null; events: GaEvent[] }): Promise<void> {
  if (!env.GA_API_SECRET || opts.events.length === 0) return;
  const session: GaParams = opts.client.sessionId ? { session_id: opts.client.sessionId, engagement_time_msec: 1 } : {};
  const body = {
    client_id: opts.client.clientId,
    ...(opts.userId ? { user_id: opts.userId } : {}),
    ...(opts.emailHash ? { user_data: { sha256_email_address: [opts.emailHash] } } : {}),
    events: opts.events.map((e) => ({ name: e.name, params: { ...session, ...e.params } })),
  };
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${encodeURIComponent(env.GA_API_SECRET)}`;
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    if (!res.ok) console.warn('ga send failed', res.status, opts.events.map((e) => e.name).join(','));
  } catch (err) {
    console.warn('ga send failed', String(err));
  }
}
