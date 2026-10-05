#!/usr/bin/env node
/**
 * Track creator and press outreach in the outreach table.
 *
 *   npm run outreach -- import <file.json>            add people (skips names already there)
 *   npm run outreach -- list [status] [x|email|other] [--json] who is where, by the channel to use
 *   npm run outreach -- show <id>                      one person, with their message
 *   npm run outreach -- draft <id> <message file>      save the message to send
 *   npm run outreach -- sent <id> [x|email|other]      mark sent (defaults to their channel)
 *   npm run outreach -- status <id> <status> [note]    replied, won, declined, ...
 *   npm run outreach -- set <id> <email|other_contact|x_handle> <value>  fill in a contact we found later
 *   npm run outreach -- email <id> <subject> [body file] [--dry-run]
 *                                                      email them from me@skeptrune.com and mark sent;
 *                                                      Fastmail when configured, otherwise gws-gmail;
 *                                                      body defaults to their
 *                                                      message, blank lines separate paragraphs; someone
 *                                                      who already replied or was won keeps that status
 *   npm run outreach -- email-draft <id> <subject> [body file] [--dry-run]
 *                                                      create a Fastmail draft without sending
 *   npm run outreach -- email-draft-update <person id> <old draft id> <subject> <body file> [--dry-run]
 *                                                      replace a verified unsent Fastmail draft without sending
 *   npm run outreach -- email-send-draft <person id> <draft id> <subject> [--dry-run]
 *                                                      send the exact existing draft after verifying its body
 *   npm run outreach -- mail-status                   verify Fastmail account and sender (read only)
 *   npm run outreach -- mail-search '<query JSON>'    read only JMAP Email/query arguments: filter, position, limit
 *   npm run outreach -- mail-read <id> [id ...]        fetch email bodies without changing read state
 *   npm run outreach -- email-reply <person id> <email id> <body file> [--dry-run]
 *                                                      reply in the existing Fastmail thread
 *   npm run outreach -- mail-reply <email> <email id> <body file> [--dry-run]
 *                                                      reply without adding a person to the outreach tracker
 *
 * Add --local to any command to use the local D1. The channel is the first contact we have:
 * X, then email, then other_contact.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fastmail, messageHtml, statusAfterDraft } from './outreach-mail.mjs';

const STATUSES = ['new', 'drafted', 'sent', 'replied', 'won', 'declined', 'no_contact'];
const CHANNELS = ['x', 'email', 'other'];

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const dryRun = args.includes('--dry-run');
const json = args.includes('--json');
const [command, ...rest] = args.filter((a) => !['--local', '--dry-run', '--json'].includes(a));

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
  if (json) console.log(JSON.stringify(rows, null, 2));
  else {
    for (const p of rows) console.log([p.id, p.status.padEnd(10), (channelOf(p) ?? '-').padEnd(5), p.kind.padEnd(7), p.name.slice(0, 32).padEnd(32), contactOf(p)].join('  '));
    console.log(`${rows.length} people`);
  }
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
} else if (['mail-status', 'mail-search', 'mail-read'].includes(command)) {
  try {
    const client = fastmail();
    const result = command === 'mail-status' ? await client.status()
      : command === 'mail-search' ? await client.search(rest[0] ? JSON.parse(rest[0]) : {})
      : await client.read(rest);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'email-reply' || command === 'mail-reply') {
  const [id, emailId, file] = rest;
  if (!id || !emailId || !file) fail(`usage: ${command} <${command === 'mail-reply' ? 'email' : 'person id'}> <email id> <body file> [--dry-run]`);
  const p = command === 'email-reply' ? one(id) : { email: id };
  const text = readFileSync(file, 'utf8').trim();
  const client = fastmail();
  let delivery;
  try {
    const message = { id: emailId, to: p.email, text };
    if (dryRun) {
      console.log(JSON.stringify(await client.replyMessage(message), null, 2));
      process.exit(0);
    }
    delivery = await client.reply(message);
  } catch (error) {
    fail(error.message);
  }
  // A follow up preserves the original message and first contact timestamps.
  if (command === 'email-reply') {
    const now = Date.now();
    const notes = [p.notes, `${new Date(now).toISOString().slice(0, 10)}: replied to ${emailId}, fastmail id ${delivery.id}, submission id ${delivery.submissionId}; body: ${text}${delivery.warning ? `; ${delivery.warning}` : ''}`].filter(Boolean).join('\n');
    d1(`UPDATE outreach SET notes = ${sql(notes)}, updated_at = ${now} WHERE id = ${sql(p.id)}`);
  }
  console.log(JSON.stringify(delivery, null, 2));
} else if (command === 'email-draft-update') {
  const [id, draftId, subject, file] = rest;
  if (!id || !draftId || !subject || !file) fail('usage: email-draft-update <person id> <old draft id> <subject> <body file> [--dry-run]');
  const p = one(id);
  if (!p.email) fail(`${p.name} has no email`);
  if (!p.message?.trim()) fail(`${p.name} has no expected draft message`);
  const text = readFileSync(file, 'utf8').trim();
  if (!text) fail(`${p.name} has an empty message`);
  if (dryRun) {
    console.log(`replace draft: ${draftId}\nto: ${p.email}\nsubject: ${subject}\n\n${text}`);
    process.exit(0);
  }
  let replacement;
  try {
    replacement = await fastmail().replaceDraft({ id: draftId, to: p.email, subject, text, expectedText: p.message });
  } catch (error) {
    fail(error.message);
  }
  if (!replacement.replaced) {
    console.log(JSON.stringify(replacement, null, 2));
    fail(replacement.warning);
  }
  const now = Date.now();
  const notes = [p.notes, `${new Date(now).toISOString().slice(0, 10)}: replaced fastmail draft ${draftId} with draft ${replacement.id} for ${p.email}`].filter(Boolean).join('\n');
  try {
    d1(`UPDATE outreach SET message = ${sql(text)}, status = ${sql(statusAfterDraft(p.status))}, notes = ${sql(notes)}, updated_at = ${now} WHERE id = ${sql(p.id)}`);
  } catch (error) {
    console.log(JSON.stringify(replacement, null, 2));
    fail(`Draft replacement succeeded (${replacement.id}), but tracker update failed; inspect the replacement before retrying: ${error.message}`);
  }
  console.log(JSON.stringify(replacement, null, 2));
} else if (['email', 'email-draft', 'email-send-draft'].includes(command)) {
  const [id, subject, file] = command === 'email-send-draft' ? [rest[0], rest[2], null] : rest;
  const draftId = command === 'email-send-draft' ? rest[1] : null;
  if (command === 'email-send-draft' && !draftId) fail('usage: email-send-draft <person id> <draft id> <subject> [--dry-run]');
  if (!subject) fail(command === 'email-send-draft'
    ? 'usage: email-send-draft <person id> <draft id> <subject> [--dry-run]'
    : `usage: ${command} <id> <subject> [body file] [--dry-run]`);
  const p = one(id);
  if (!p.email) fail(`${p.name} has no email`);
  if (command !== 'email-draft' && p.sent_via === 'email') fail(`${p.name} was already emailed`);
  const text = (file ? readFileSync(file, 'utf8') : p.message ?? fail(`${p.name} has no message`)).trim();
  if (!text) fail(`${p.name} has an empty message`);
  if (dryRun) {
    console.log(`to: ${p.email}\nsubject: ${subject}\n\n${text}`);
    process.exit(0);
  }
  let delivery;
  try {
    if (command === 'email-draft') delivery = await fastmail().createDraft({ to: p.email, subject, text });
    else if (command === 'email-send-draft') delivery = await fastmail().sendDraft({ id: draftId, to: p.email, subject, text });
    else if (process.env.FASTMAIL_JMAP_TOKEN) delivery = await fastmail().send({ to: p.email, subject, text });
    else {
      const send = ['gmail', '+send', '--to', p.email, '--from', 'Nick Khami <me@skeptrune.com>', '--subject', subject, '--body', messageHtml(text), '--html'];
      const env = { ...process.env, GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND: 'file', GOOGLE_WORKSPACE_CLI_CONFIG_DIR: `${process.env.HOME}/.config/gws-gmail` };
      const out = execFileSync('gws', send, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'inherit'] });
      const id = JSON.parse(out.slice(out.indexOf('{'))).id;
      if (!id) fail('gws returned no message id');
      delivery = { provider: 'gmail', id };
    }
  } catch (error) {
    fail(error.message);
  }
  const now = Date.now();
  if (command === 'email-draft') {
    const notes = [p.notes, `${new Date(now).toISOString().slice(0, 10)}: email draft for ${p.email}, ${delivery.provider} draft id ${delivery.id}`].filter(Boolean).join('\n');
    d1(`UPDATE outreach SET status = ${sql(statusAfterDraft(p.status))}, notes = ${sql(notes)}, updated_at = ${now} WHERE id = ${sql(p.id)}`);
    console.log(`drafted email for ${p.name} <${p.email}>: ${delivery.id}`);
    process.exit(0);
  }
  const notes = [p.notes, `${new Date(now).toISOString().slice(0, 10)}: emailed ${p.email}, ${delivery.provider} id ${delivery.id}${delivery.submissionId ? `, submission id ${delivery.submissionId}` : ''}${delivery.warning ? `; ${delivery.warning}` : ''}`].filter(Boolean).join('\n');
  // A follow-up to someone who already answered keeps their status; only a first touch becomes 'sent'.
  const status = ['replied', 'won'].includes(p.status) ? p.status : 'sent';
  d1(`UPDATE outreach SET status = ${sql(status)}, sent_via = 'email', sent_at = ${now}, notes = ${sql(notes)}, updated_at = ${now} WHERE id = ${sql(p.id)}`);
  console.log(`emailed ${p.name} <${p.email}>: ${delivery.id}`);
  if (delivery.warning) console.warn(delivery.warning);
} else {
  fail('usage: npm run outreach -- import|list|show|draft|sent|status|set|mail-status|mail-search|mail-read|mail-reply|email-draft|email-draft-update|email-send-draft|email-reply|email ... (see scripts/outreach.mjs)');
}
