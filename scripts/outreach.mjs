#!/usr/bin/env node
/**
 * Track creator and press outreach in the outreach table.
 *
 *   npm run outreach -- import <file.json>            add people (skips names already there)
 *   npm run outreach -- list [status] [x|email|other] who is where, by the channel to use
 *   npm run outreach -- show <id>                      one person, with their message
 *   npm run outreach -- draft <id> <message file>      save the message to send
 *   npm run outreach -- sent <id> [x|email|other]      mark sent (defaults to their channel)
 *   npm run outreach -- status <id> <status> [note]    replied, won, declined, ...
 *   npm run outreach -- set <id> <email|other_contact|x_handle> <value>  fill in a contact we found later
 *   npm run outreach -- email <id> <subject> [body file] [--dry-run]
 *                                                      email them from me@skeptrune.com (gws-gmail
 *                                                      profile) and mark sent; body defaults to their
 *                                                      message, blank lines separate paragraphs; someone
 *                                                      who already replied or was won keeps that status
 *
 * Add --local to any command to use the local D1. The channel is the first contact we have:
 * X, then email, then other_contact.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const STATUSES = ['new', 'drafted', 'sent', 'replied', 'won', 'declined', 'no_contact'];
const CHANNELS = ['x', 'email', 'other'];

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const dryRun = args.includes('--dry-run');
const [command, ...rest] = args.filter((a) => a !== '--local' && a !== '--dry-run');

const sql = (v) => (v === null || v === undefined || v === '' ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
function d1(statement) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', statement], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out)[0].results;
}
const channelOf = (p) => (p.x_handle ? 'x' : p.email ? 'email' : p.other_contact ? 'other' : null);
const contactOf = (p) => ({ x: `x.com/${p.x_handle}`, email: p.email, other: p.other_contact })[channelOf(p)] ?? '-';
function fail(message) {
  console.error(message);
  process.exit(1);
}
function one(id) {
  const [row] = d1(`SELECT * FROM outreach WHERE id = ${sql(id)}`);
  return row ?? fail(`no outreach row ${id}`);
}

if (command === 'import') {
  const people = JSON.parse(readFileSync(rest[0] ?? fail('usage: import <file.json>'), 'utf8'));
  const existing = new Set(d1('SELECT name, kind FROM outreach').map((r) => `${r.kind}:${r.name}`));
  const now = Date.now();
  let added = 0;
  for (const p of people) {
    if (!p.name || !['creator', 'press'].includes(p.kind)) fail(`bad row: ${JSON.stringify(p)}`);
    if (existing.has(`${p.kind}:${p.name}`)) continue;
    const handle = p.x_handle?.replace(/^@/, '') || null;
    const status = channelOf({ ...p, x_handle: handle }) ? 'new' : 'no_contact';
    d1(
      `INSERT INTO outreach (id, name, kind, platform, audience, profile_url, x_handle, email, other_contact, notes, status, created_at, updated_at)
       VALUES (${sql(randomUUID().replace(/-/g, '').slice(0, 12))}, ${sql(p.name)}, ${sql(p.kind)}, ${sql(p.platform)}, ${sql(p.audience)},
               ${sql(p.profile_url)}, ${sql(handle)}, ${sql(p.email)}, ${sql(p.other_contact)}, ${sql(p.notes)}, ${sql(status)}, ${now}, ${now})`,
    );
    added++;
  }
  console.log(`added ${added}, skipped ${people.length - added} already there`);
} else if (command === 'list') {
  const status = rest.find((a) => STATUSES.includes(a));
  const channel = rest.find((a) => CHANNELS.includes(a));
  const rows = d1(`SELECT * FROM outreach ${status ? `WHERE status = ${sql(status)}` : ''} ORDER BY kind, status, name`).filter((p) => !channel || channelOf(p) === channel);
  for (const p of rows) console.log([p.id, p.status.padEnd(10), (channelOf(p) ?? '-').padEnd(5), p.kind.padEnd(7), p.name.slice(0, 32).padEnd(32), contactOf(p)].join('  '));
  console.log(`${rows.length} people`);
} else if (command === 'show') {
  const p = one(rest[0]);
  console.log({ ...p, channel: channelOf(p) });
} else if (command === 'draft') {
  const [id, file] = rest;
  if (!file) fail('usage: draft <id> <message file>');
  one(id);
  d1(`UPDATE outreach SET message = ${sql(readFileSync(file, 'utf8').trim())}, status = 'drafted', updated_at = ${Date.now()} WHERE id = ${sql(id)}`);
  console.log(`drafted ${id}`);
} else if (command === 'sent') {
  const p = one(rest[0]);
  const via = rest[1] ?? channelOf(p);
  if (!CHANNELS.includes(via)) fail('usage: sent <id> [x|email|other]');
  const now = Date.now();
  d1(`UPDATE outreach SET status = 'sent', sent_via = ${sql(via)}, sent_at = ${now}, updated_at = ${now} WHERE id = ${sql(p.id)}`);
  console.log(`marked ${p.name} sent via ${via}`);
} else if (command === 'status') {
  const [id, status, ...note] = rest;
  if (!STATUSES.includes(status)) fail(`status must be one of ${STATUSES.join(', ')}`);
  const p = one(id);
  const now = Date.now();
  const notes = note.length ? [p.notes, `${new Date(now).toISOString().slice(0, 10)}: ${note.join(' ')}`].filter(Boolean).join('\n') : p.notes;
  d1(`UPDATE outreach SET status = ${sql(status)}, notes = ${sql(notes)}, updated_at = ${now}${status === 'replied' ? `, replied_at = ${now}` : ''} WHERE id = ${sql(id)}`);
  console.log(`${p.name}: ${status}`);
} else if (command === 'set') {
  const [id, field, value] = rest;
  if (!['email', 'other_contact', 'x_handle'].includes(field) || !value) fail('usage: set <id> <email|other_contact|x_handle> <value>');
  const p = one(id);
  d1(`UPDATE outreach SET ${field} = ${sql(value)}, updated_at = ${Date.now()} WHERE id = ${sql(id)}`);
  console.log(`${p.name}: ${field} = ${value}`);
} else if (command === 'email') {
  const [id, subject, file] = rest;
  if (!subject) fail('usage: email <id> <subject> [body file] [--dry-run]');
  const p = one(id);
  if (!p.email) fail(`${p.name} has no email`);
  if (p.sent_via === 'email') fail(`${p.name} was already emailed`);
  const text = (file ? readFileSync(file, 'utf8') : p.message ?? fail(`${p.name} has no message`)).trim();
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = text
    .split(/\n\s*\n/)
    .map((para) => `<div>${para.split('\n').map(escape).join('<br>')}</div>`)
    .join('<div><br></div>');
  const send = ['gmail', '+send', '--to', p.email, '--from', 'Nick Khami <me@skeptrune.com>', '--subject', subject, '--body', html, '--html'];
  const env = { ...process.env, GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND: 'file', GOOGLE_WORKSPACE_CLI_CONFIG_DIR: `${process.env.HOME}/.config/gws-gmail` };
  if (dryRun) {
    console.log(`to: ${p.email}\nsubject: ${subject}\n\n${text}`);
    process.exit(0);
  }
  const out = execFileSync('gws', send, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'inherit'] });
  const gmailId = JSON.parse(out.slice(out.indexOf('{'))).id ?? fail(`gws returned no message id: ${out}`);
  const now = Date.now();
  const notes = [p.notes, `${new Date(now).toISOString().slice(0, 10)}: emailed ${p.email}, gmail id ${gmailId}`].filter(Boolean).join('\n');
  // A follow-up to someone who already answered keeps their status; only a first touch becomes 'sent'.
  const status = ['replied', 'won'].includes(p.status) ? p.status : 'sent';
  d1(`UPDATE outreach SET status = ${sql(status)}, sent_via = 'email', sent_at = ${now}, notes = ${sql(notes)}, updated_at = ${now} WHERE id = ${sql(p.id)}`);
  console.log(`emailed ${p.name} <${p.email}>: ${gmailId}`);
} else {
  fail('usage: npm run outreach -- import|list|show|draft|sent|status|set|email ... (see scripts/outreach.mjs)');
}
