#!/usr/bin/env node
/** Pull daily campaign/ad spend from Reddit Ads API v3 into reddit_ad_spend. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const token = process.env.REDDIT_ADS_ACCESS_TOKEN;
const account = process.env.REDDIT_AD_ACCOUNT_ID;
if (!token || !account) throw new Error('set REDDIT_ADS_ACCESS_TOKEN and REDDIT_AD_ACCOUNT_ID');
const remote = process.argv.includes('--remote');
const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
const days = Math.max(1, Math.min(730, Number(daysArg?.split('=')[1] ?? 90)));
if (!Number.isFinite(days)) throw new Error('--days must be a number from 1 to 730');

const end = new Date();
end.setUTCMinutes(0, 0, 0);
const start = new Date(end.getTime() - days * 86_400_000);
const spec = {
  data: {
    breakdowns: ['DATE', 'CAMPAIGN_ID', 'AD_ID'],
    fields: ['SPEND'],
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    time_zone_id: 'UTC',
  },
};
const metrics = [];
let url = `https://ads-api.reddit.com/api/v3/ad_accounts/${encodeURIComponent(account)}/reports?page.size=1000`;
while (url) {
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'call4me-reddit-spend/1.0' }, body: JSON.stringify(spec) });
  const body = await res.json();
  if (!res.ok) throw new Error(`Reddit report ${res.status}: ${JSON.stringify(body).slice(0, 1000)}`);
  metrics.push(...(body.data?.metrics ?? []));
  url = body.pagination?.next_url ?? '';
}

const sql = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const syncedAt = Date.now();
const statements = metrics.map((row) => {
  const date = String(row.date ?? '').slice(0, 10);
  const campaignId = String(row.campaign_id ?? '');
  const adId = String(row.ad_id ?? '');
  const spend = Math.round(Number(row.spend ?? 0));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isSafeInteger(spend) || spend < 0) throw new Error(`invalid report row: ${JSON.stringify(row)}`);
  return `INSERT INTO reddit_ad_spend (date, campaign_id, ad_group_id, ad_id, creative_id, currency, spend_micros, synced_at) VALUES (${sql(date)}, ${sql(campaignId)}, '', ${sql(adId)}, '', 'USD', ${spend}, ${syncedAt}) ON CONFLICT(date, campaign_id, ad_group_id, ad_id, creative_id) DO UPDATE SET spend_micros = excluded.spend_micros, synced_at = excluded.synced_at;`;
});
if (!statements.length) {
  console.log('Reddit returned no spend rows.');
  process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), 'call4me-reddit-spend-'));
const file = join(dir, 'spend.sql');
try {
  writeFileSync(file, `${statements.join('\n')}\n`, { mode: 0o600 });
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', remote ? '--remote' : '--local', '--file', file], { stdio: 'inherit' });
  console.log(`Synced ${statements.length} Reddit spend rows (${remote ? 'remote' : 'local'} D1).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

