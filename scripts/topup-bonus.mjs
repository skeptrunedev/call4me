#!/usr/bin/env node
/**
 * Give an account a top-up bonus: extra credits on top of what it adds, granted automatically by
 * the every-minute cron when each payment lands, with an email to the customer
 * (services/topup-bonuses.ts). Only payments from now on count.
 *
 *   npm run bonus -- <email> <percent> [note]              their next payment gets <percent>% more
 *   npm run bonus -- <email> <percent> [note] --uses <n>   their next n payments
 *   npm run bonus -- <email> <percent> [note] --every      every payment, until turned off
 *   npm run bonus -- <email> --off                         turn it off
 *   npm run bonus -- <email>                               show it
 *   add --local for the local D1
 *
 * Setting a bonus replaces the account's current one.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 1) && true : false;
};
const where = flag('--local') ? '--local' : '--remote';
const off = flag('--off');
const every = flag('--every');
const usesAt = args.indexOf('--uses');
const uses = usesAt >= 0 ? Number(args.splice(usesAt, 2)[1]) : every ? null : 1;
const [email, percentArg, ...noteWords] = args;
const percent = percentArg === undefined ? null : Number(percentArg);
if (!email?.includes('@') || (percent !== null && (off || !Number.isInteger(percent) || percent < 1 || percent > 100)) || (uses !== null && (!Number.isInteger(uses) || uses < 1)) || (every && usesAt >= 0)) {
  console.error('usage: npm run bonus -- <email> [<percent 1-100> [note] [--uses <n> | --every] | --off] [--local]');
  process.exit(1);
}

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;
function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out)[0].results;
}

const [found] = d1(`SELECT id FROM accounts WHERE email = ${sqlString(email.trim().toLowerCase())}`);
if (!found) {
  console.error(`no account for ${email}`);
  process.exit(1);
}
const id = sqlString(found.id);
if (off) d1(`DELETE FROM topup_bonuses WHERE account_id = ${id}`);
else if (percent !== null) {
  const note = noteWords.join(' ') || 'bonus from Nick';
  d1(
    `INSERT INTO topup_bonuses (account_id, percent, remaining, note, created_at) VALUES (${id}, ${percent}, ${uses ?? 'NULL'}, ${sqlString(note)}, ${Date.now()})
     ON CONFLICT(account_id) DO UPDATE SET percent = excluded.percent, remaining = excluded.remaining, note = excluded.note, created_at = excluded.created_at`,
  );
}
const [bonus] = d1(`SELECT percent, remaining, note, created_at FROM topup_bonuses WHERE account_id = ${id}`);
const granted = d1(`SELECT count(*) AS n, COALESCE(sum(bonus_cents), 0) AS cents FROM topup_bonus_grants WHERE account_id = ${id}`)[0];
const sofar = granted.n ? ` ${granted.n} bonus${granted.n === 1 ? '' : 'es'} granted so far, $${(granted.cents / 100).toFixed(2)} in all.` : '';
if (!bonus) console.log(`${email} has no top-up bonus.${sofar}`);
else {
  const which = bonus.remaining === null ? 'every payment' : bonus.remaining === 1 ? 'their next payment' : `their next ${bonus.remaining} payments`;
  console.log(`${email}: ${which} gets ${bonus.percent}% more credits (${bonus.note}), counting payments since ${new Date(bonus.created_at).toISOString()}.${sofar}`);
}
