#!/usr/bin/env node
/**
 * Delete an account and everything tied to it, for a deletion request: the sign-in user, its
 * sessions and OAuth grants, the call4me account, profile, calls, ledger, verified numbers,
 * attribution, and any mailing-list or blog rows under the same email.
 *
 *   npm run delete-account -- <email>               show what would be deleted (production D1)
 *   npm run delete-account -- <email> --yes         delete it
 *   npm run delete-account -- <email> [--yes] --local
 *
 * Refuses an account that paid or holds a phone number: payment records are kept for tax, and a
 * number has to be released at Telnyx first. Call recordings stay with Telnyx (see /privacy).
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const confirmed = args.includes('--yes');
const [rawEmail] = args.filter((a) => !a.startsWith('--'));
if (!rawEmail?.includes('@')) {
  console.error('usage: npm run delete-account -- <email> [--yes] [--local]');
  process.exit(1);
}
const email = rawEmail.trim().toLowerCase();

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;
function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out).at(-1).results;
}

const [account] = d1(`SELECT id, user_id FROM accounts WHERE email = ${sqlString(email)}`);
const [user] = d1(`SELECT id FROM "user" WHERE lower(email) = ${sqlString(email)}`);
if (!account && !user) {
  console.error(`no account for ${email}.`);
  process.exit(1);
}
const a = sqlString(account?.id ?? '');
const u = sqlString(account?.user_id ?? user?.id ?? '');
const e = sqlString(email);

const [held] = d1(`SELECT
  (SELECT count(*) FROM topups WHERE account_id = ${a} AND status = 'paid') AS paid,
  (SELECT count(*) FROM numbers WHERE account_id = ${a}) AS numbers`);
if (held.paid || held.numbers) {
  console.error(`${email} has ${held.paid} paid top-up(s) and ${held.numbers} number(s); not deleting automatically.`);
  process.exit(1);
}

// Children before parents: D1 enforces foreign keys.
const calls = `SELECT id FROM calls WHERE account_id = ${a}`;
const visits = `SELECT id FROM reddit_visits WHERE account_id = ${a}`;
const steps = [
  ['call_questions', `call_id IN (${calls})`],
  ['scheduled_calls', `account_id = ${a} OR call_id IN (${calls})`],
  ['sms_consent_events', `account_id = ${a}`],
  ['verified_numbers', `account_id = ${a}`],
  ['ledger', `account_id = ${a}`],
  ['topups', `account_id = ${a} OR lower(email) = ${e}`],
  ['key_resets', `account_id = ${a}`],
  ['profiles', `account_id = ${a}`],
  ['drip_sends', `account_id = ${a}`],
  ['supporters', `account_id = ${a}`],
  ['signup_notices', `account_id = ${a}`],
  ['email_unsubscribe_tokens', `account_id = ${a}`],
  ['meta_conversions', `account_id = ${a}`],
  ['reddit_conversions', `account_id = ${a} OR visit_id IN (${visits})`],
  ['calls', `account_id = ${a}`],
  ['accounts', `id = ${a}`],
  ['reddit_visits', `account_id = ${a}`],
  ['"oauthAccessToken"', `"userId" = ${u}`],
  ['"oauthRefreshToken"', `"userId" = ${u}`],
  ['"oauthConsent"', `"userId" = ${u}`],
  ['"oauthClient"', `"userId" = ${u}`],
  ['"session"', `"userId" = ${u}`],
  ['"account"', `"userId" = ${u}`],
  ['verification', `identifier LIKE ${sqlString(`%${email}%`)}`],
  ['"user"', `id = ${u}`],
  ['subscribers', `lower(email) = ${e}`],
  ['blog_comments', `lower(email) = ${e}`],
];

const [counts] = d1(`SELECT ${steps.map(([t, w], i) => `(SELECT count(*) FROM ${t} WHERE ${w}) AS c${i}`).join(', ')}`);
const found = steps.map(([t], i) => [t.replace(/"/g, ''), counts[`c${i}`]]).filter(([, n]) => n);
console.log(`${email}: ${found.map(([t, n]) => `${t} ${n}`).join(', ')}`);
if (!confirmed) {
  console.log('nothing deleted; rerun with --yes to delete.');
  process.exit(0);
}

// A call answering another of theirs points at it; clear that first, then everything in one command.
d1([`UPDATE calls SET callback_for = NULL WHERE callback_for IN (${calls})`, ...steps.map(([t, w]) => `DELETE FROM ${t} WHERE ${w}`)].join(';\n'));
const [left] = d1(`SELECT (SELECT count(*) FROM accounts WHERE email = ${e}) + (SELECT count(*) FROM "user" WHERE lower(email) = ${e}) AS n`);
console.log(left.n ? `${email} still has ${left.n} row(s) left; check by hand.` : `deleted ${email}.`);
