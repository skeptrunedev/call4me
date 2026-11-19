#!/usr/bin/env node
/**
 * Give an existing account credits (a ledger 'adjustment'), e.g. the $25 for drip feedback, or
 * take credits given by mistake back.
 *
 *   npm run grant -- <email> <dollars> [note]          production D1
 *   npm run grant -- <email> <dollars> [note] --local  local D1
 *   npm run grant -- <email> <dollars> [note] --create also open the account if they haven't signed in yet
 *   npm run grant -- <email> <dollars> [note] --take   take that much back instead
 *
 * The account must already exist (it's created at sign-in or first purchase) unless --create is
 * given, which opens it under the email the way a purchase before sign-in does: their first
 * sign-in with that email adopts it, credits included. --take never leaves a balance below $0:
 * what calls in progress hold is already out of it, and the check and the entry are one statement.
 * Prints the new balance.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const create = args.includes('--create');
const take = args.includes('--take');
const [email, dollars, ...noteWords] = args.filter((a) => !['--local', '--create', '--take'].includes(a));
const cents = Math.round(Number(dollars) * 100);
if (!email?.includes('@') || !Number.isInteger(cents) || cents <= 0 || cents > 100_000 || (take && create)) {
  console.error('usage: npm run grant -- <email> <dollars (0.01 to 1000)> [note] [--local] [--create | --take]');
  process.exit(1);
}
const note = noteWords.join(' ') || (take ? 'credits taken back by Nick' : 'credits from Nick');

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;
function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out)[0].results;
}

const account = sqlString(email.trim().toLowerCase());
// Same row accounts.ensure() makes for a purchase before sign-in.
if (create) d1(`INSERT OR IGNORE INTO accounts (id, email, created_at) VALUES (${sqlString(randomUUID().replace(/-/g, '').slice(0, 16))}, ${account}, ${Date.now()})`);
const [found] = d1(`SELECT id FROM accounts WHERE email = ${account}`);
if (!found) {
  console.error(`no account for ${email}. they need to sign in (or buy credits) at call4.me first, or pass --create.`);
  process.exit(1);
}
const id = randomUUID().replace(/-/g, '').slice(0, 16);
const balanceOf = `SELECT COALESCE(SUM(amount_cents), 0) FROM ledger WHERE account_id = ${sqlString(found.id)}`;
d1(
  `INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at)
   SELECT ${sqlString(id)}, ${sqlString(found.id)}, ${take ? -cents : cents}, 'adjustment', ${sqlString(`${take ? 'take' : 'grant'}:${id}`)}, ${sqlString(note)}, ${Date.now()}
   WHERE ${take ? `(${balanceOf}) >= ${cents}` : '1'}`,
);
const [{ b, done }] = d1(`SELECT (${balanceOf}) AS b, EXISTS (SELECT 1 FROM ledger WHERE id = ${sqlString(id)}) AS done`);
const balance = `$${(b / 100).toFixed(2)}`;
if (!done) {
  console.error(`balance is ${balance}, less than $${(cents / 100).toFixed(2)}; nothing taken.`);
  process.exit(1);
}
console.log(`${take ? 'took' : 'granted'} $${(cents / 100).toFixed(2)} ${take ? 'from' : 'to'} ${email} (${note}). balance: ${balance}`);
