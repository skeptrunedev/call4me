#!/usr/bin/env node
/**
 * Merge one account into another, when one person ended up with two (Tom's personal and RankSurge
 * accounts): every call, credit, monthly reload, number and verified number moves over, and the
 * merged account's sign-ins and agent connections open the one that stays.
 *
 *   npm run merge-accounts -- <from email> <into email>            show what would move (production D1)
 *   npm run merge-accounts -- <from email> <into email> --yes      merge
 *   npm run merge-accounts -- <from email> <into email> [--yes] --local
 *
 * The account that stays keeps its own profile, API key and free number; the other's free number
 * comes along as an extra one at no monthly cost. Monthly reloads keep billing as they were and
 * credit the account that stays. The merged account's API key stops working.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const confirmed = args.includes('--yes');
const [fromEmail, intoEmail] = args.filter((a) => !a.startsWith('--')).map((e) => e?.trim().toLowerCase());
if (!fromEmail?.includes('@') || !intoEmail?.includes('@') || fromEmail === intoEmail) {
  console.error('usage: npm run merge-accounts -- <from email> <into email> [--yes] [--local]');
  process.exit(1);
}

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;
function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out).at(-1).results;
}

function account(email) {
  const [found] = d1(`SELECT id, user_id FROM accounts WHERE email = ${sqlString(email)}`);
  if (!found) {
    console.error(`no account for ${email}.`);
    process.exit(1);
  }
  return found;
}
const from = account(fromEmail);
const into = account(intoEmail);
const f = sqlString(from.id);
const i = sqlString(into.id);

// Tables keyed by account that move as they are, and those with one row per account, where the
// account that stays keeps its own and the merged one's is dropped.
const moved = ['calls', 'ledger', 'topups', 'reloads', 'verified_numbers', 'scheduled_calls', 'reddit_visits', 'reddit_conversions', 'meta_conversions', 'sms_consent_events'];
const oneEach = ['profiles', 'drip_sends', 'supporters', 'signup_notices', 'email_unsubscribe_tokens', 'key_resets'];

const [counts] = d1(`SELECT ${[...moved, ...oneEach, 'numbers'].map((t) => `(SELECT count(*) FROM ${t} WHERE account_id = ${f}) AS ${t}`).join(', ')},
  (SELECT COALESCE(SUM(amount_cents), 0) FROM ledger WHERE account_id = ${f}) AS balance`);
console.log(`${fromEmail} -> ${intoEmail}: ${Object.entries(counts).filter(([, n]) => n).map(([t, n]) => (t === 'balance' ? `balance $${(n / 100).toFixed(2)}` : `${t} ${n}`)).join(', ')}`);
if (!confirmed) {
  console.log('nothing moved; rerun with --yes to merge.');
  process.exit(0);
}

const statements = [
  ...moved.map((t) => `UPDATE ${t} SET account_id = ${i} WHERE account_id = ${f}`),
  // An account has one free number: the merged one's comes along as an extra that never renews or bills.
  `UPDATE numbers SET included = 0, monthly_cents = 0, paid_through = NULL WHERE account_id = ${f} AND included = 1 AND EXISTS (SELECT 1 FROM numbers WHERE account_id = ${i} AND included = 1)`,
  `UPDATE numbers SET account_id = ${i} WHERE account_id = ${f}`,
  ...oneEach.flatMap((t) => [`UPDATE OR IGNORE ${t} SET account_id = ${i} WHERE account_id = ${f}`, `DELETE FROM ${t} WHERE account_id = ${f}`]),
  `UPDATE accounts SET stripe_customer_id = COALESCE(stripe_customer_id, (SELECT stripe_customer_id FROM accounts WHERE id = ${f})), sales_calls = MAX(sales_calls, (SELECT sales_calls FROM accounts WHERE id = ${f})) WHERE id = ${i}`,
  `DELETE FROM accounts WHERE id = ${f}`,
];
// Signing in the way the merged account did (its Google login, its agents' OAuth grants) now opens the one that stays.
if (from.user_id && into.user_id) {
  const fu = sqlString(from.user_id);
  const iu = sqlString(into.user_id);
  for (const t of ['"account"', '"session"', '"oauthConsent"', '"oauthAccessToken"', '"oauthRefreshToken"', '"oauthClient"']) statements.push(`UPDATE ${t} SET "userId" = ${iu} WHERE "userId" = ${fu}`);
  statements.push(`DELETE FROM "user" WHERE id = ${fu}`);
}
d1(statements.join(';\n'));

const [after] = d1(`SELECT (SELECT count(*) FROM accounts WHERE id = ${f}) AS left_over, (SELECT COALESCE(SUM(amount_cents), 0) FROM ledger WHERE account_id = ${i}) AS balance, (SELECT count(*) FROM calls WHERE account_id = ${i}) AS calls`);
console.log(after.left_over ? `${fromEmail} still exists; check by hand.` : `merged ${fromEmail} into ${intoEmail}: ${after.calls} calls, balance $${(after.balance / 100).toFixed(2)}.`);
