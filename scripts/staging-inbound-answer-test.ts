/**
 * How long a caller waits for staging to pick up, and what a caller who hangs up first leaves behind.
 *
 *   npm run staging:inbound-answer-test                    # rings until we answer, hangs up 8s in
 *   npm run staging:inbound-answer-test -- --give-up 3000  # the caller hangs up 3s after dialing
 *
 * Dials staging's business number from itself on staging's Telnyx app, so both legs are ours, and
 * reads Telnyx's own event log for the leg that rang: when it started, when our answer command went
 * in, when it was answered or the caller gave up, and when our webhook replied to call.initiated.
 * On prod, callers who hung up about 3s in were lost (2026-11-14: Jessica Kaufman calling MJ Cargo
 * Trailers back, a pharmacy calling Richard Dumelle) while we took 2.5-3.9s to answer.
 *
 * Needs TELNYX_API_KEY (falls back to .dev.vars); staging's app is found by name.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { cliD1 } from './d1-cli';

if (!process.env.TELNYX_API_KEY && existsSync('.dev.vars')) loadEnvFile('.dev.vars');
const KEY = process.env.TELNYX_API_KEY;
if (!KEY) throw new Error('TELNYX_API_KEY is not set');
const { values } = parseArgs({ options: { 'give-up': { type: 'string' } } });
const giveUpMs = values['give-up'] ? Number(values['give-up']) : null;
const HANG_UP_ANSWERED_MS = 8_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function telnyx(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.telnyx.com/v2${path}`, { method, headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  return json;
}

const db = cliD1('--remote', 'staging');
const apps = await telnyx('GET', `/call_control_applications?filter[application_name][contains]=callbay-staging`);
const app: string | undefined = apps.data.find((a: { application_name: string }) => a.application_name === 'callbay-staging')?.id;
if (!app) throw new Error('no callbay-staging call control application');
const owner = await db.prepare(`SELECT a.id, n.phone_number FROM accounts a JOIN numbers n ON n.account_id = a.id AND n.status = 'active' WHERE a.email = 'staging-test@call4.me'`).first<{ id: string; phone_number: string }>();
if (!owner) throw new Error('staging-test@call4.me has no active number on staging');

const t0 = Date.now();
const dialed = await telnyx('POST', '/calls', { connection_id: app, to: owner.phone_number, from: owner.phone_number, timeout_secs: 30 });
const dialing: string = dialed.data.call_control_id;
console.log(`dialed ${owner.phone_number} from itself on staging${giveUpMs === null ? '' : `, giving up after ${giveUpMs}ms`}`);
await sleep(Math.max(0, (giveUpMs ?? HANG_UP_ANSWERED_MS) - (Date.now() - t0)));
await telnyx('POST', `/calls/${encodeURIComponent(dialing)}/actions/hangup`, {}).catch((err: Error) => console.log(`hanging up the dialing leg: ${err.message}`));

interface Event { name: string; occurred_at: string; leg_id?: string; payload?: { payload?: Record<string, string> }; webhook_delivery?: { finished_at?: string } }
const ms = (s?: string) => (s ? Date.parse(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`) : NaN);
// The leg that rang our number: incoming on staging's app, to the test number, started after we dialed.
let leg: Event[] = [];
for (let i = 0; i < 30; i++) {
  await sleep(2_000);
  const from = new Date(t0 - 2_000).toISOString();
  const { data } = await telnyx('GET', `/call_events?filter[occurred_at][gte]=${from}&filter[to]=${encodeURIComponent(owner.phone_number)}&page[size]=100`);
  const initiated = (data as Event[]).find((e) => e.name === 'call.initiated' && e.payload?.payload?.connection_id === app && e.payload?.payload?.direction === 'incoming');
  // Commands (our answer) carry the leg too; the account's prod calls never share it.
  leg = initiated?.leg_id ? (data as Event[]).filter((e) => e.leg_id === initiated.leg_id) : [];
  if (leg.some((e) => e.name === 'call.hangup')) break;
}
leg.sort((a, b) => ms(a.occurred_at) - ms(b.occurred_at));
const started = ms(leg.find((e) => e.name === 'call.initiated')?.payload?.payload?.start_time);
if (!leg.length || Number.isNaN(started)) {
  console.log('INCONCLUSIVE  Telnyx has no incoming leg for this call yet: run it again');
  process.exit(2);
}
const since = (t: number) => `+${((t - started) / 1000).toFixed(2)}s`;
console.log(`\nthe leg that rang (times from when it started ringing):`);
for (const e of leg) {
  const p = e.payload?.payload ?? {};
  const cause = e.name === 'call.hangup' ? ` ${p.hangup_cause} ${p.sip_hangup_cause} by ${p.hangup_source}` : '';
  const replied = e.name === 'call.initiated' && e.webhook_delivery?.finished_at ? `, our webhook replied ${since(ms(e.webhook_delivery.finished_at))}` : '';
  console.log(`  ${since(ms(e.occurred_at)).padStart(7)} ${e.name}${cause}${replied}`);
}
const row = await db.prepare(`SELECT id, status, error, answered_at, created_at FROM calls WHERE account_id = ? AND direction = 'inbound' AND created_at >= ? ORDER BY created_at DESC LIMIT 1`).bind(owner.id, t0 - 2_000).first<{ id: string; status: string; error: string | null; answered_at: number | null; created_at: number }>();
console.log(`\nstaging's call row: ${row ? `${row.id} ${row.status}, created ${since(row.created_at)}${row.answered_at ? `, answered ${since(row.answered_at)}` : ''}${row.error ? `\n  ${row.error.slice(0, 200)}` : ''}` : 'none'}`);
// Telnyx's log sometimes leaves out the answer command and call.answered too; the row's answered_at
// (set by our call.answered webhook) is when we picked up either way.
const answeredEvent = leg.find((e) => e.name === 'call.answered');
const pickedUpAt = answeredEvent ? ms(answeredEvent.occurred_at) : row?.answered_at ?? null;
const gaveUp = leg.find((e) => e.name === 'call.hangup' && e.payload?.payload?.hangup_cause === 'originator_cancel');
console.log(pickedUpAt ? `\nPICKED UP ${since(pickedUpAt)} after the caller started ringing${answeredEvent ? '' : ' (from our row: Telnyx logged no call.answered)'}` : `\nNEVER PICKED UP: the caller gave up ${gaveUp ? since(ms(gaveUp.occurred_at)) : ''} first`);
