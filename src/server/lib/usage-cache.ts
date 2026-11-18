import { usageParts, usageTotals, type UsageTotals } from '../services/stats';
import { errorText } from './errors';

/**
 * The footer's usage totals, kept in the edge cache so pages show them without waiting on D1.
 * Totals older than FRESH_MS are still served while one refresh runs in the background; the
 * entry itself lasts a day, so a quiet location only waits on D1 for its first visitor.
 */
const FRESH_MS = 60_000;
const KEEP_SECONDS = 86_400;

interface Cached extends UsageTotals { at: number }

/**
 * The stale copy (by its `at`) this isolate is refreshing. Every page renders the footer, so a
 * burst of page loads used to start a count of every call each: a scanner's ~160 requests did,
 * and D1 refused them as overloaded along with the agents' tool calls landing then (2026-11-18).
 */
let refreshing: number | null = null;

const keyFor = (url: string) => new Request(new URL('/__usage-totals', url));

/** What the edge cache holds, or null. Never reads D1, so static pages can use it. */
export async function cachedUsage(url: string): Promise<Cached | null> {
  const hit = await caches.default.match(keyFor(url));
  return hit ? hit.json<Cached>() : null;
}

/** Current totals: from the edge cache when it has them (refreshing a stale copy in the background), else from D1. */
export async function usage(db: D1Database | D1DatabaseSession, url: string, ctx: Pick<ExecutionContext, 'waitUntil'>): Promise<UsageTotals> {
  const remember = (totals: UsageTotals) => caches.default.put(keyFor(url), Response.json({ ...totals, at: Date.now() } satisfies Cached, { headers: { 'cache-control': `public, max-age=${KEEP_SECONDS}` } }));
  const cached = await cachedUsage(url).catch(() => null);
  if (!cached) {
    const totals = await usageTotals(db);
    ctx.waitUntil(remember(totals).catch((err) => console.error('usage cache write failed', errorText(err))));
    return totals;
  }
  if (Date.now() - cached.at > FRESH_MS && refreshing !== cached.at) {
    const stale = cached.at;
    refreshing = stale;
    // The copy is marked fresh before D1 is read, so this location's other isolates serve it meanwhile instead of counting too.
    const refresh = remember(cached).then(() => usageTotals(db)).then(remember);
    ctx.waitUntil(refresh.catch((err) => console.error('usage refresh failed', errorText(err))).finally(() => { if (refreshing === stale) refreshing = null; }));
  }
  return { calls: cached.calls, minutes: cached.minutes };
}

const PLACEHOLDER = /(<span [^>]*data-site-call-count[^>]*>)loading call count</;

/** A prebuilt page's footer with the cached totals filled in, so it doesn't render "loading" first. */
export function fillUsage(html: string, totals: UsageTotals): string {
  const [calls, minutes] = usageParts(totals);
  return html.replace(PLACEHOLDER, (_, open: string) => `${open}<span>${calls}</span> <span>${minutes}</span><`);
}
