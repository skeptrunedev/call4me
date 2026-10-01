#!/usr/bin/env node
/**
 * Make a sign-in with email and password, e.g. the demo account the ChatGPT directory's reviewers
 * use. There is no password sign-up on the site; this is the only way such an account is made.
 *
 *   npm run password-user -- <email> <name>          production D1
 *   npm run password-user -- <email> <name> --local  local D1
 *
 * Prints a fresh random password once (it is stored only as a hash). Running it again for the
 * same email sets a new password. The call4me account is opened under the email right away, so
 * `npm run grant` works before the first sign-in, which adopts it.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const [rawEmail, ...nameWords] = args.filter((a) => a !== '--local');
const email = rawEmail?.trim().toLowerCase();
const name = nameWords.join(' ').trim();
if (!email?.includes('@') || !name) {
  console.error('usage: npm run password-user -- <email> <name> [--local]');
  process.exit(1);
}

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;
function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out)[0].results;
}

const password = randomBytes(18).toString('base64url');
const hash = await hashPassword(password);
const at = sqlString(new Date().toISOString());

let [user] = d1(`SELECT id FROM "user" WHERE email = ${sqlString(email)}`);
if (!user) {
  user = { id: randomUUID() };
  d1(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (${sqlString(user.id)}, ${sqlString(name)}, ${sqlString(email)}, 1, ${at}, ${at})`);
}
const [credential] = d1(`SELECT id FROM "account" WHERE userId = ${sqlString(user.id)} AND providerId = 'credential'`);
if (credential) d1(`UPDATE "account" SET password = ${sqlString(hash)}, updatedAt = ${at} WHERE id = ${sqlString(credential.id)}`);
else {
  d1(
    `INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt)
     VALUES (${sqlString(randomUUID())}, ${sqlString(user.id)}, 'credential', ${sqlString(user.id)}, ${sqlString(hash)}, ${at}, ${at})`,
  );
}
const accountId = randomUUID().replace(/-/g, '').slice(0, 16);
d1(`INSERT OR IGNORE INTO accounts (id, email, display_name, created_at) VALUES (${sqlString(accountId)}, ${sqlString(email)}, ${sqlString(name)}, ${Date.now()})`);

console.log(`${email} signs in at https://call4.me/login ("sign in with a password") with:\n${password}`);
