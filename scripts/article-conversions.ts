/** Read only article acquisition report. Uses the same D1 adapter as the operational CLIs. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cliD1 } from './d1-cli';

export interface ConversionRow {
  landing: string;
  source: string;
  medium: string;
  attribution: 'recorded before signup' | 'recorded after signup' | 'unknown';
  signups: number;
  fundedCheckoutAccounts: number;
  firstCompletedCallAccounts: number;
}
export interface SearchRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }
export interface SearchResponse { rows?: SearchRow[]; metadata?: { firstIncompleteDate?: string }; lastAvailableDate?: string }

export function dateRange(start: string, end: string) {
  const day = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error(`Invalid date: ${value}`);
    return Date.parse(`${value}T00:00:00Z`);
  };
  const from = day(start), until = day(end) + 86400000;
  if (from >= until) throw new Error('Start must be on or before end');
  return { from, until };
}

/** No account identifiers, email addresses, calls or transcripts leave the database. */
export async function articleConversions(db: D1Database, from: number, until: number, internalEmails: string[], asOf = until) {
  const exclusions = internalEmails.length ? `AND lower(a.email) NOT IN (${internalEmails.map(() => '?').join(', ')})` : '';
  return (await db.prepare(`
    WITH cohort AS (
      SELECT a.id, a.created_at, CASE WHEN json_valid(a.first_touch) THEN a.first_touch ELSE '{}' END AS touch
      FROM accounts a WHERE a.created_at >= ? AND a.created_at < ? ${exclusions}
    ), attributed AS (
      SELECT id,
        CASE WHEN json_type(touch, '$.source') = 'text' AND json_type(touch, '$.medium') = 'text'
          AND json_type(touch, '$.landing') = 'text' AND json_type(touch, '$.at') IN ('integer', 'real')
          AND json_extract(touch, '$.at') >= 0 AND json_extract(touch, '$.at') < ?
          THEN CASE WHEN json_extract(touch, '$.at') <= created_at THEN 'recorded before signup' ELSE 'recorded after signup' END
          ELSE 'unknown' END AS attribution,
        CASE WHEN json_extract(touch, '$.landing') LIKE '/blog/%' THEN json_extract(touch, '$.landing') ELSE '(other landing)' END AS landing,
        json_extract(touch, '$.source') AS source, json_extract(touch, '$.medium') AS medium
      FROM cohort
    ), first_calls AS (
      SELECT account_id, MIN(ended_at) AS first_at FROM calls
      WHERE direction = 'outbound' AND status = 'completed' AND ended_at IS NOT NULL GROUP BY account_id
    ), first_payments AS (
      SELECT account_id, MIN(paid_at) AS first_at FROM topups
      WHERE status = 'paid' AND paid_at IS NOT NULL GROUP BY account_id
    )
    SELECT CASE WHEN attribution = 'unknown' THEN '(unknown)' ELSE landing END AS landing,
      CASE WHEN attribution = 'unknown' THEN '(unknown)' ELSE source END AS source,
      CASE WHEN attribution = 'unknown' THEN '(unknown)' ELSE medium END AS medium,
      attribution, COUNT(*) AS signups,
      SUM(CASE WHEN p.first_at < ? THEN 1 ELSE 0 END) AS fundedCheckoutAccounts,
      SUM(CASE WHEN c.first_at < ? THEN 1 ELSE 0 END) AS firstCompletedCallAccounts
    FROM attributed a LEFT JOIN first_calls c ON c.account_id = a.id LEFT JOIN first_payments p ON p.account_id = a.id
    GROUP BY 1, 2, 3, 4 ORDER BY signups DESC
  `).bind(from, Math.min(until, asOf), ...internalEmails.map(email => email.toLowerCase()), asOf, asOf, asOf).all<ConversionRow>()).results;
}

/** Include every current article, even when Search Console has no reported row for it. */
export function combineArticles(slugs: string[], conversions: ConversionRow[], search: SearchRow[]) {
  return slugs.map(slug => {
    const landing = `/blog/${slug}`;
    const rows = conversions.filter(row => row.landing === landing && row.attribution === 'recorded before signup');
    const observedLater = conversions.filter(row => row.landing === landing && row.attribution === 'recorded after signup');
    const organic = rows.filter(row => row.source === 'google' && row.medium === 'organic');
    const gsc = search.find(row => row.keys[0] === `https://call4.me${landing}`);
    const sum = (group: ConversionRow[], field: 'signups' | 'fundedCheckoutAccounts' | 'firstCompletedCallAccounts') => group.reduce((total, row) => total + row[field], 0);
    return { article: landing, search: gsc ? { clicks: gsc.clicks, impressions: gsc.impressions, ctr: gsc.ctr, position: gsc.position } : null,
      signups: sum(rows, 'signups'), fundedCheckoutAccounts: sum(rows, 'fundedCheckoutAccounts'), firstCompletedCallAccounts: sum(rows, 'firstCompletedCallAccounts'),
      googleOrganic: { signups: sum(organic, 'signups'), fundedCheckoutAccounts: sum(organic, 'fundedCheckoutAccounts'), firstCompletedCallAccounts: sum(organic, 'firstCompletedCallAccounts') },
      laterObservedAccounts: sum(observedLater, 'signups'), sources: rows.map(({ source, medium, signups, fundedCheckoutAccounts, firstCompletedCallAccounts }) => ({ source, medium, signups, fundedCheckoutAccounts, firstCompletedCallAccounts })) };
  }).sort((a, b) => b.fundedCheckoutAccounts - a.fundedCheckoutAccounts || b.firstCompletedCallAccounts - a.firstCompletedCallAccounts || (b.search?.clicks ?? 0) - (a.search?.clicks ?? 0) || (b.search?.impressions ?? 0) - (a.search?.impressions ?? 0));
}

export function readSearchConsole(start: string, end: string, dataState: 'all' | 'final'): SearchResponse {
  const query = (dimensions: string[], startRow = 0) => JSON.parse(execFileSync('gws', ['searchconsole:v1', 'searchanalytics', 'query',
    '--params', JSON.stringify({ siteUrl: 'sc-domain:call4.me' }), '--json', JSON.stringify({ startDate: start, endDate: end, dimensions, type: 'WEB', dataState: dataState.toUpperCase(),
      dimensionFilterGroups: [{ filters: [{ dimension: 'PAGE', operator: 'INCLUDING_REGEX', expression: '^https://call4\\.me/blog/[^/?]+$' }] }], rowLimit: 25000, startRow })],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env: { ...process.env, GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND: 'file', GOOGLE_WORKSPACE_CLI_CONFIG_DIR: resolve(homedir(), '.config/gws-personal') }, stdio: ['ignore', 'pipe', 'inherit'] })) as SearchResponse;
  const rows: SearchRow[] = [];
  for (let startRow = 0; ; startRow += 25000) {
    const response = query(['PAGE'], startRow);
    rows.push(...response.rows ?? []);
    if ((response.rows?.length ?? 0) < 25000) break;
  }
  // The incomplete date metadata is returned with DATE grouping, not PAGE grouping.
  const dates = query(['DATE']);
  return { rows, metadata: dates.metadata, lastAvailableDate: dates.rows?.map(row => row.keys[0]).sort().at(-1) };
}

async function main() {
  const { values } = parseArgs({ options: { start: { type: 'string' }, end: { type: 'string' }, 'data-state': { type: 'string', default: 'final' }, local: { type: 'boolean', default: false }, 'as-of': { type: 'string' } } });
  if (!values.start || !values.end || !['all', 'final'].includes(values['data-state']!)) throw new Error('Usage: npm run seo:conversions -- --start YYYY-MM-DD --end YYYY-MM-DD [--data-state final|all] [--as-of ISO_TIMESTAMP] [--local]');
  const { from, until } = dateRange(values.start, values.end);
  if (values['as-of'] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(values['as-of'])) throw new Error('Conversion cutoff requires an ISO timestamp with explicit timezone');
  const asOf = values['as-of'] ? Date.parse(values['as-of']) : Date.now();
  if (!Number.isFinite(asOf) || asOf < from || asOf > Date.now()) throw new Error('Conversion cutoff must be a valid past timestamp at or after cohort start');
  const root = new URL('../', import.meta.url);
  // Use the existing dashboard exclusion list rather than create a different customer definition.
  const config = readFileSync(new URL('dashboard/wrangler.jsonc', root), 'utf8');
  const internal = /"INTERNAL_EMAILS"\s*:\s*"([^"]+)"/.exec(config)?.[1];
  if (!internal) throw new Error('Dashboard INTERNAL_EMAILS is missing; refusing to count internal test accounts');
  const index = readFileSync(new URL('src/content/blog/index.ts', root), 'utf8');
  const slugs = [...index.matchAll(/slug: '([^']+)'/g)].map(match => match[1]);
  if (!slugs.length) throw new Error('No published articles found in the blog registry');
  const conversions = await articleConversions(cliD1(values.local ? '--local' : '--remote'), from, until, internal.split(',').map(email => email.trim()), asOf);
  let search: SearchResponse | null = null;
  let searchError: string | null = null;
  try { search = readSearchConsole(values.start, values.end, values['data-state'] as 'all' | 'final'); }
  catch (error) { searchError = error instanceof Error ? error.message : String(error); }
  const articles = combineArticles(slugs, conversions, search?.rows ?? []);
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), start: values.start, end: values.end, conversionsAsOf: new Date(asOf).toISOString(),
    definitions: { cohort: 'Accounts created in the inclusive date range, UTC. Dashboard internal accounts excluded. Conversions followed through conversionsAsOf, separately from the signup cohort window.',
      attribution: 'Stored account first touch recorded no later than account creation. Later observed touches are separate and are not acquisition claims; touches dated after the conversion cutoff remain unknown. No assisted conversion or attribution backfill.',
      fundedCheckoutAccounts: 'Distinct accounts with a successful checkout topup currently marked paid and paid_at before conversionsAsOf, matching the dashboard. Refunds excluded. May include discounted or zero-charge checkouts; net cash received is not stored here. Not purchase events or revenue.',
      firstCompletedCallAccounts: 'Distinct accounts with their first completed outbound call ended before conversionsAsOf. Completion is not task success.',
      search: 'Google web search page metrics, Pacific dates. Not joined to individual visitors. Missing rows are null, not proof of zero exposure. Click to signup rates are deliberately not computed.',
      scope: 'First touch only; no internal touch or client identity inferred. Cookie loss and earlier anonymous visits remain unknown.' },
    searchConsole: { status: search ? 'ok' : 'unavailable', dataState: values['data-state'], metadata: search?.metadata ?? null, lastAvailableDate: search?.lastAvailableDate ?? null, error: searchError },
    coverage: { excludedInternalEmails: internal.split(',').length, cohortAccounts: conversions.reduce((n, row) => n + row.signups, 0),
      unknownAttributionAccounts: conversions.filter(row => row.attribution === 'unknown').reduce((n, row) => n + row.signups, 0),
      laterObservedAccounts: conversions.filter(row => row.attribution === 'recorded after signup').reduce((n, row) => n + row.signups, 0) }, articles }, null, 2));
  if (searchError) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
