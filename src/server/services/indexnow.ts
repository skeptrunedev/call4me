/**
 * IndexNow (indexnow.org): tell Bing, Yandex, Seznam, Naver and Yep the moment a page is new or
 * changed, instead of waiting for a crawl. Runs on the cron: every sitemap URL whose lastmod
 * differs from what indexnow_sent recorded goes out in one batch; rows are written only after
 * the endpoint accepts it, so a failed ping is retried on the next run. The key is public by
 * design and served at /<key>.txt (routes/agent.tsx).
 */
import type { SitemapEntry } from '../lib/discovery';
import { now } from '../lib/ids';

/**
 * Yandex's endpoint, not api.indexnow.org: that one and Bing's answer 429 to every request from
 * Workers' shared egress IPs, so nothing was ever accepted. Participating engines share each
 * submission with one another, so Bing still gets it.
 */
const ENDPOINT = 'https://yandex.com/indexnow';
/** The protocol's limit per request. */
const MAX_URLS = 10_000;

export async function submitIndexNow(opts: { db: D1Database; site: string; key: string; entries: SitemapEntry[] }): Promise<{ sent: number; status?: number }> {
  const { results } = await opts.db.prepare(`SELECT url, lastmod FROM indexnow_sent`).all<{ url: string; lastmod: string }>();
  const sent = new Map(results.map((r) => [r.url, r.lastmod]));
  const due = opts.entries.filter((e) => sent.get(e.loc) !== (e.lastmod ?? '')).slice(0, MAX_URLS);
  if (due.length === 0) return { sent: 0 };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(opts.site).host, key: opts.key, keyLocation: `${opts.site}/${opts.key}.txt`, urlList: due.map((e) => e.loc) }),
  });
  // 200 and 202 both mean accepted (202: key validation pending).
  if (res.status !== 200 && res.status !== 202) {
    console.error('indexnow rejected', res.status, (await res.text()).slice(0, 500));
    return { sent: 0, status: res.status };
  }
  const at = now();
  await opts.db.batch(
    due.map((e) => opts.db.prepare(`INSERT INTO indexnow_sent (url, lastmod, sent_at) VALUES (?, ?, ?) ON CONFLICT (url) DO UPDATE SET lastmod = excluded.lastmod, sent_at = excluded.sent_at`).bind(e.loc, e.lastmod ?? '', at)),
  );
  return { sent: due.length, status: res.status };
}
