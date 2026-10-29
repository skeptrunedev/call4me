import { usageText, usageTotals, type UsageTotals } from '../services/stats';

/**
 * The footer's usage totals, kept in the edge cache so pages show them without waiting on D1.
 * Totals older than FRESH_MS are still served while one refresh runs in the background; the
 * entry itself lasts a day, so a quiet location only waits on D1 for its first visitor.
 */
const FRESH_MS = 60_000;
const KEEP_SECONDS = 86_400;

interface Cached extends UsageTotals { at: number }

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
    ctx.waitUntil(remember(totals).catch((err) => console.error('usage cache write failed', err)));
    return totals;
  }
  if (Date.now() - cached.at > FRESH_MS) ctx.waitUntil(usageTotals(db).then(remember).catch((err) => console.error('usage refresh failed', err)));
  return { calls: cached.calls, minutes: cached.minutes };
}

const PLACEHOLDER = /(<span data-site-call-count[^>]*>)([^<]*?)loading call count</;

/** A prebuilt page's footer with the cached totals filled in, so it doesn't render "loading" first. */
export function fillUsage(html: string, totals: UsageTotals): string {
  return html.replace(PLACEHOLDER, (_, open: string, separator: string) => `${open}${separator}${usageText(totals, separator)}<`);
}
