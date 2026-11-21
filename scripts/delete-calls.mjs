#!/usr/bin/env node
/**
 * Delete particular calls for a deletion request: their brief, business name and goal, transcript,
 * recap, mid-call questions, ledger notes, voice session storage and carrier recordings, exactly as
 * zero data retention does (services/zdr.ts). This marks them for deletion; the every-minute cron
 * that purges zero data retention calls deletes them, retrying until the recordings are gone too,
 * and this waits to report that. The numbers, times, length and cost stay, for billing and abuse
 * prevention.
 *
 *   npm run delete-calls -- <email> <call_id>...          show what would be deleted (production D1)
 *   npm run delete-calls -- <email> <call_id>... --yes    delete them
 *   npm run delete-calls -- <email> <call_id>... [--yes] --local
 *
 * Refuses a call that isn't the account's or hasn't ended.
 */
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const confirmed = args.includes('--yes');
const [rawEmail, ...ids] = args.filter((a) => !a.startsWith('--'));
if (!rawEmail?.includes('@') || !ids.length || ids.some((id) => !/^call_[a-z0-9]+$/.test(id))) {
  console.error('usage: npm run delete-calls -- <email> <call_id>... [--yes] [--local]');
  process.exit(1);
}
const email = rawEmail.trim().toLowerCase();

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;
function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out).at(-1).results;
}
const pt = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' }) + ' PT';

const [account] = d1(`SELECT id FROM accounts WHERE email = ${sqlString(email)}`);
if (!account) {
  console.error(`no account for ${email}.`);
  process.exit(1);
}
const list = ids.map(sqlString).join(', ');
const rows = d1(`SELECT id, account_id, business, direction, ended_at, purged_at, delete_requested_at FROM calls WHERE id IN (${list})`);
const byId = new Map(rows.map((r) => [r.id, r]));
const refused = ids.flatMap((id) => {
  const r = byId.get(id);
  if (!r) return [`${id}: no such call`];
  if (r.account_id !== account.id) return [`${id}: not a call of ${email}`];
  if (!r.ended_at) return [`${id}: hasn't ended yet`];
  return [];
});
if (refused.length) {
  console.error(refused.join('\n'));
  process.exit(1);
}
for (const id of ids) {
  const r = byId.get(id);
  console.log(`${id}  ${r.direction} ${r.business}, ended ${pt(r.ended_at)}${r.purged_at ? `  (already deleted ${pt(r.purged_at)})` : ''}`);
}
const pending = ids.filter((id) => !byId.get(id).purged_at);
if (!pending.length) {
  console.log('nothing left to delete.');
  process.exit(0);
}
if (!confirmed) {
  console.log(`nothing deleted; rerun with --yes to delete ${pending.length} call(s).`);
  process.exit(0);
}

const pendingList = pending.map(sqlString).join(', ');
d1(`UPDATE calls SET delete_requested_at = ${Date.now()} WHERE id IN (${pendingList}) AND account_id = ${sqlString(account.id)} AND purged_at IS NULL AND delete_requested_at IS NULL`);
console.log(`marked ${pending.length} call(s); waiting for the purge (it runs every minute)...`);
if (where === '--local') process.exit(0);
for (let waited = 0; waited < 6 * 60_000; waited += 20_000) {
  await sleep(20_000);
  const left = d1(`SELECT id, purge_attempts FROM calls WHERE id IN (${pendingList}) AND purged_at IS NULL`);
  if (!left.length) {
    console.log(`deleted ${pending.length} call(s): content, voice session storage and recordings.`);
    process.exit(0);
  }
  const retrying = left.filter((r) => r.purge_attempts > 0);
  if (retrying.length) console.log(`still retrying: ${retrying.map((r) => `${r.id} (attempt ${r.purge_attempts})`).join(', ')}`);
}
console.log('not finished after 6 minutes; the cron keeps retrying. Its reason is logged as "purge incomplete" (cflogs query -w callbay).');
process.exit(1);
