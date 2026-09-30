#!/usr/bin/env node
/**
 * Move credits between two existing accounts (a pair of ledger 'adjustment's), e.g. when someone
 * paid at checkout under one email and then signed in with another.
 *
 *   npm run transfer -- <from email> <to email> <dollars> [note]          production D1
 *   npm run transfer -- <from email> <to email> <dollars> [note] --local  local D1
 *
 * Refuses to take more than the source account's balance. Prints both new balances.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const [fromEmail, toEmail, dollars, ...noteWords] = args.filter((a) => a !== '--local');
const cents = Math.round(Number(dollars) * 100);
if (!fromEmail?.includes('@') || !toEmail?.includes('@') || !Number.isInteger(cents) || cents <= 0 || cents > 100_000) {
  console.error('usage: npm run transfer -- <from email> <to email> <dollars (0.01 to 1000)> [note] [--local]');
  process.exit(1);
}
const note = noteWords.join(' ') || 'credits moved by Nick';

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;
function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out).at(-1).results;
}

function account(email) {
  const [found] = d1(`SELECT id FROM accounts WHERE email = ${sqlString(email.trim().toLowerCase())}`);
  if (!found) {
    console.error(`no account for ${email}.`);
    process.exit(1);
  }
  return found.id;
}
const balance = (id) => d1(`SELECT COALESCE(SUM(amount_cents), 0) AS b FROM ledger WHERE account_id = ${sqlString(id)}`)[0].b;

const from = account(fromEmail);
const to = account(toEmail);
if (from === to) {
  console.error('from and to are the same account.');
  process.exit(1);
}
const available = balance(from);
if (available < cents) {
  console.error(`${fromEmail} only has $${(available / 100).toFixed(2)}.`);
  process.exit(1);
}

const id = randomUUID().replace(/-/g, '').slice(0, 16);
const at = Date.now();
// One command, so both rows land or neither does.
d1(
  `INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES
     (${sqlString(`${id}o`)}, ${sqlString(from)}, ${-cents}, 'adjustment', ${sqlString(`transfer:${id}:out`)}, ${sqlString(`${note} (to ${toEmail})`)}, ${at}),
     (${sqlString(`${id}i`)}, ${sqlString(to)}, ${cents}, 'adjustment', ${sqlString(`transfer:${id}:in`)}, ${sqlString(`${note} (from ${fromEmail})`)}, ${at})`,
);
const fmt = (c) => `$${(c / 100).toFixed(2)}`;
console.log(`moved ${fmt(cents)} from ${fromEmail} (now ${fmt(balance(from))}) to ${toEmail} (now ${fmt(balance(to))}).`);
