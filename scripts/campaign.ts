/** Schedule an approved email for a snapshot of eligible accounts using native Fastmail delivery.
 * prepare records private unsubscribe tokens; schedule is the explicit external mail action.
 * Keep state in ignored scratch/, never commit recipient addresses or signed unsubscribe links.
 *
 * Fastmail is not a bulk sender (its terms close accounts for duplicative mass mail) and carries
 * call4me's own transactional mail, so a campaign to everyone should drip: --per-day caps each day
 * (e.g. 40,60,80,110,120,140), spread through --hours from the --at time of day, the accounts that
 * have completed calls going first. Several "Subject:" lines rotate across recipients.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { cliD1 } from './d1-cli';
import { fastmail } from './outreach-mail.mjs';
import { createCampaignUnsubscribes } from '../src/server/services/campaign-unsubscribe';

export interface Recipient {
  accountId: string;
  email: string;
  text: string;
  state: 'prepared' | 'drafted' | 'scheduling' | 'scheduled' | 'skipped' | 'canceled';
  emailId?: string;
  submissionId?: string;
  /** Per recipient in a drip; absent in a single-time campaign, which uses the campaign's own. */
  sendAt?: string;
  subject?: string;
  unsubscribe?: string;
}
export interface Campaign {
  version: 1;
  createdAt: string;
  sendAt: string;
  subject: string;
  fingerprint: string;
  recipients: Recipient[];
}
type Submission = { id: string; emailId: string; sendAt: string; undoStatus: string };
type Client = {
  createDraft(message: { to: string; subject: string; text: string; listUnsubscribe?: string }): Promise<{ id: string }>;
  scheduleDraft(message: { id: string; to: string; subject: string; text: string; sendAt: string }): Promise<{ submissionId: string }>;
  submissionsForEmail(id: string): Promise<Submission[]>;
  submissions(ids: string[]): Promise<{ list: Submission[]; notFound?: string[] }>;
  cancelSubmissions(ids: string[]): Promise<string[]>;
  destroyEmails(ids: string[]): Promise<string[]>;
};

export async function eligibleRecipients(db: D1Database, internal: string[]) {
  if (!internal.length) throw new Error('Internal account exclusions are required');
  const rows = (await db.prepare(`SELECT a.id, a.email FROM accounts a
    WHERE a.email_opt_out = 0 AND lower(trim(a.email)) NOT LIKE '%.invalid'
      AND lower(trim(a.email)) NOT IN (${internal.map(() => '?').join(', ')})
      AND NOT EXISTS (SELECT 1 FROM subscribers s WHERE lower(trim(s.email)) = lower(trim(a.email)) AND s.status = 'unsubscribed')
    ORDER BY a.created_at, a.id`).bind(...internal.map(email => email.trim().toLowerCase())).all<{ id: string; email: string }>()).results;
  const seen = new Set<string>();
  return rows.filter(row => {
    row.email = row.email.trim().toLowerCase();
    if (!/^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/.test(row.email)) throw new Error(`Invalid email on account ${row.id}`);
    if (seen.has(row.email)) return false;
    seen.add(row.email);
    return true;
  });
}

// Per-recipient fields are left out of the JSON when absent, so single-time campaigns keep their fingerprint.
export function fingerprint(campaign: Pick<Campaign, 'subject' | 'sendAt' | 'recipients'>) {
  return createHash('sha256').update(JSON.stringify({ subject: campaign.subject, sendAt: campaign.sendAt,
    recipients: campaign.recipients.map(({ accountId, email, text, sendAt, subject, unsubscribe }) => ({ accountId, email, text, sendAt, subject, unsubscribe })) })).digest('hex');
}

const sendAtOf = (campaign: Campaign, recipient: Recipient) => recipient.sendAt ?? campaign.sendAt;
const subjectOf = (campaign: Campaign, recipient: Recipient) => recipient.subject ?? campaign.subject;

/** A message file: one or more "Subject:" lines, a blank line, then the body. */
export function parseCampaignMessage(source: string) {
  const match = /^((?:Subject: [^\n]+\n)+)\n([\s\S]+)$/.exec(source.replace(/\r\n/g, '\n'));
  const subjects = match?.[1].split('\n').filter(Boolean).map(line => line.slice('Subject: '.length).trim()) ?? [];
  if (!match || !subjects.length || subjects.some(subject => !subject) || !match[2].trim()) throw new Error('Message file needs one or more Subject: lines, a blank line, and a body');
  if (new Set(subjects).size !== subjects.length) throw new Error('Subjects must differ');
  return { subjects, text: match[2].trim() };
}

/**
 * Send times for a drip, in order: day d sends at most perDay[d], evenly through `hours` from
 * `start` plus d days, each at a random whole second inside its slot so sends never line up.
 */
export function dripTimes(count: number, start: number, perDay: number[], hours: number, random = Math.random): string[] {
  if (!perDay.length || perDay.some(n => !Number.isInteger(n) || n < 1)) throw new Error('--per-day takes whole numbers above zero');
  if (!(hours >= 1 && hours <= 24)) throw new Error('--hours must be between 1 and 24');
  if (perDay.reduce((a, b) => a + b, 0) < count) throw new Error(`--per-day caps add up to fewer than the ${count} recipients`);
  const times: string[] = [];
  for (let day = 0; times.length < count; day++) {
    const today = Math.min(perDay[day], count - times.length);
    const slot = (hours * 3600_000) / today;
    for (let i = 0; i < today; i++) {
      const at = start + day * 86400_000 + i * slot + Math.floor(random() * slot * 0.9);
      times.push(new Date(Math.floor(at / 1000) * 1000).toISOString().replace('.000Z', 'Z'));
    }
  }
  return times;
}

/** Accounts that completed a call go first, latest caller first, then the rest newest signup first. */
export async function engagementOrder(db: D1Database, rows: { id: string; email: string }[]) {
  const last = new Map((await db.prepare(`SELECT account_id, max(created_at) AS at FROM calls
    WHERE status = 'completed' AND direction = 'outbound' GROUP BY account_id`).all<{ account_id: string; at: number }>()).results.map(r => [r.account_id, r.at]));
  const callers = rows.filter(r => last.has(r.id)).sort((a, b) => last.get(b.id)! - last.get(a.id)!);
  return [...callers, ...rows.filter(r => !last.has(r.id)).reverse()];
}

export function verifyScheduled(submission: Submission | undefined, recipient: Recipient, sendAt: string) {
  if (!submission || submission.emailId !== recipient.emailId || submission.sendAt !== sendAt || submission.undoStatus !== 'pending') {
    throw new Error(`Unverified schedule for account ${recipient.accountId}; inspect submission ${submission?.id ?? recipient.submissionId ?? 'unknown'} before retrying`);
  }
}

/** Persist before submission so an interrupted request is inspected rather than repeated. */
export async function scheduleCampaign(campaign: Campaign, client: Client, save: () => void, eligible: Set<string>) {
  if (campaign.fingerprint !== fingerprint(campaign)) throw new Error('Campaign content or audience changed after preparation');
  const open = campaign.recipients.filter(r => !['skipped', 'scheduled', 'canceled'].includes(r.state));
  if (open.some(r => Date.parse(sendAtOf(campaign, r)) <= Date.now())) throw new Error('Schedule is no longer in the future');
  for (const recipient of open) {
    // Resolve uncertain prior submissions before considering any new write.
    if (recipient.state === 'scheduling') {
      const prior = (await client.submissionsForEmail(recipient.emailId!)).filter(s => s.undoStatus !== 'canceled');
      if (prior.length !== 1) throw new Error(`Uncertain submission for account ${recipient.accountId}; inspect email ${recipient.emailId}, do not automatically resend`);
      verifyScheduled(prior[0], recipient, sendAtOf(campaign, recipient));
      recipient.submissionId = prior[0].id;
      recipient.state = 'scheduled';
      save();
      continue;
    }
    if (!eligible.has(recipient.accountId)) {
      recipient.state = 'skipped';
      save();
      continue;
    }
    const message = { to: recipient.email, subject: subjectOf(campaign, recipient), text: recipient.text };
    if (recipient.state === 'prepared') {
      const draft = await client.createDraft({ ...message, ...(recipient.unsubscribe ? { listUnsubscribe: recipient.unsubscribe } : {}) });
      recipient.emailId = draft.id;
      recipient.state = 'drafted';
      save();
    }
    recipient.state = 'scheduling';
    save();
    const result = await client.scheduleDraft({ ...message, id: recipient.emailId!, sendAt: sendAtOf(campaign, recipient) });
    recipient.submissionId = result.submissionId;
    recipient.state = 'scheduled';
    save();
  }
}

/**
 * Call off every scheduled send that hasn't gone out, then remove the unsent copies that scheduling
 * filed in Sent. A send already released can't be called back, so it stays scheduled and is reported.
 */
export async function cancelCampaign(campaign: Campaign, client: Client, save: () => void) {
  if (campaign.recipients.some(r => r.state === 'scheduling')) throw new Error('A send is mid-schedule; run status first so it is resolved before canceling');
  const scheduled = campaign.recipients.filter(r => r.state === 'scheduled');
  for (let offset = 0; offset < scheduled.length; offset += 100) {
    const batch = scheduled.slice(offset, offset + 100);
    const current = await client.submissions(batch.map(r => r.submissionId!));
    const pending = batch.filter(r => current.list.find(s => s.id === r.submissionId)?.undoStatus === 'pending');
    if (pending.length) await client.cancelSubmissions(pending.map(r => r.submissionId!));
    // Fastmail deletes a canceled submission: one gone before its send time was canceled, not sent.
    const gone = (r: Recipient) => !current.list.some(s => s.id === r.submissionId) && Date.parse(sendAtOf(campaign, r)) > Date.now();
    const canceled = batch.filter(r => pending.includes(r) || gone(r) || current.list.find(s => s.id === r.submissionId)?.undoStatus === 'canceled');
    if (canceled.length) await client.destroyEmails(canceled.map(r => r.emailId!));
    for (const r of canceled) r.state = 'canceled';
    save();
  }
  const released = campaign.recipients.filter(r => r.state === 'scheduled').length;
  return { canceled: campaign.recipients.filter(r => r.state === 'canceled').length, alreadyReleased: released };
}

export async function verifyCampaign(campaign: Campaign, client: Client) {
  if (campaign.fingerprint !== fingerprint(campaign)) throw new Error('Campaign content or audience changed');
  const scheduled = campaign.recipients.filter(r => r.state === 'scheduled');
  const pending = campaign.recipients.filter(r => !['scheduled', 'skipped', 'canceled'].includes(r.state));
  for (let offset = 0; offset < scheduled.length; offset += 100) {
    const batch = scheduled.slice(offset, offset + 100);
    const result = await client.submissions(batch.map(r => r.submissionId!));
    for (const recipient of batch) verifyScheduled(result.list.find(s => s.id === recipient.submissionId), recipient, sendAtOf(campaign, recipient));
  }
  const times = campaign.recipients.map(r => sendAtOf(campaign, r)).sort();
  return { sendAt: campaign.sendAt, lastSendAt: times[times.length - 1], scheduled: scheduled.length, remaining: pending.length,
    skipped: campaign.recipients.filter(r => r.state === 'skipped').length,
    canceled: campaign.recipients.filter(r => r.state === 'canceled').length };
}

function exclusions() {
  const config = readFileSync(new URL('../dashboard/wrangler.jsonc', import.meta.url), 'utf8');
  const emails = /"INTERNAL_EMAILS"\s*:\s*"([^"]+)"/.exec(config)?.[1];
  if (!emails) throw new Error('Dashboard INTERNAL_EMAILS is missing');
  return emails.split(',');
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    state: { type: 'string' }, file: { type: 'string' }, at: { type: 'string' }, 'per-day': { type: 'string' }, hours: { type: 'string', default: '8' },
  } });
  const [action] = positionals;
  if (positionals.length !== 1 || !['prepare', 'schedule', 'status', 'cancel'].includes(action) || !values.state) {
    throw new Error('Usage: campaign prepare --file MESSAGE --at UTC_TIMESTAMP [--per-day 40,60,... --hours 8] --state PRIVATE_JSON | schedule|status|cancel --state PRIVATE_JSON');
  }
  const statePath = resolve(values.state);
  if (action === 'prepare') {
    if (!values.file || !values.at || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(values.at) || !Number.isFinite(Date.parse(values.at)) || Date.parse(values.at) <= Date.now()) throw new Error('A message file and future UTC timestamp are required');
    if (existsSync(statePath)) throw new Error('Campaign state file already exists');
    const message = parseCampaignMessage(readFileSync(values.file, 'utf8'));
    const drip = values['per-day'] !== undefined;
    if (!drip && message.subjects.length > 1) throw new Error('Rotating subjects needs --per-day, so each day gets every subject');
    const rows = await engagementOrder(cliD1(), await eligibleRecipients(cliD1(), exclusions()));
    if (!rows.length) throw new Error('No eligible recipients');
    const times = drip ? dripTimes(rows.length, Date.parse(values.at), values['per-day']!.split(',').map(Number), Number(values.hours)) : [];
    const links = await createCampaignUnsubscribes(cliD1(), 'https://call4.me', rows.map(row => row.id));
    const linkByAccount = new Map(links.map(link => [link.accountId, link.url]));
    const firstUnsubscribe = links[0].url;
    // This GET only renders a confirmation form; the opt out requires a separate POST.
    const confirmation = await fetch(firstUnsubscribe, { method: 'GET', signal: AbortSignal.timeout(20000) });
    if (confirmation.status !== 200 || !(await confirmation.text()).includes('action="/unsubscribe"')) {
      throw new Error('Campaign unsubscribe link does not produce a valid production confirmation page');
    }
    const recipients: Recipient[] = rows.map((row, i) => ({ accountId: row.id, email: row.email,
      text: `${message.text}\n\n[unsubscribe](${linkByAccount.get(row.id)!})`, state: 'prepared',
      ...(drip ? { sendAt: times[i], subject: message.subjects[i % message.subjects.length], unsubscribe: linkByAccount.get(row.id)! } : {}) }));
    const campaign: Campaign = { version: 1, createdAt: new Date().toISOString(), sendAt: drip ? times[0] : values.at, subject: message.subjects[0], recipients, fingerprint: '' };
    campaign.fingerprint = fingerprint(campaign);
    mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
    writeFileSync(statePath, JSON.stringify(campaign, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    const perDay = Object.entries(Object.groupBy(recipients, r => sendAtOf(campaign, r).slice(0, 10))).map(([day, list]) => `${day}: ${list!.length}`);
    console.log(JSON.stringify({ prepared: recipients.length, firstSendAt: campaign.sendAt, lastSendAt: sendAtOf(campaign, recipients[recipients.length - 1]), perDay, subjects: message.subjects, stateFile: statePath }));
    return;
  }
  let campaign = JSON.parse(readFileSync(statePath, 'utf8')) as Campaign;
  if (campaign.version !== 1 || !Array.isArray(campaign.recipients)) throw new Error('Unsupported campaign file');
  const client = fastmail() as Client;
  const save = () => {
    writeFileSync(`${statePath}.next`, JSON.stringify(campaign, null, 2) + '\n', { mode: 0o600 });
    renameSync(`${statePath}.next`, statePath);
  };
  if (action === 'schedule') {
    const lockPath = `${statePath}.lock`;
    writeFileSync(lockPath, String(process.pid), { mode: 0o600, flag: 'wx' });
    try {
      campaign = JSON.parse(readFileSync(statePath, 'utf8')) as Campaign;
      const current = await eligibleRecipients(cliD1(), exclusions());
      await scheduleCampaign(campaign, client, save, new Set(current.map(row => row.id)));
    } finally {
      unlinkSync(lockPath);
    }
  }
  if (action === 'cancel') {
    console.log(JSON.stringify(await cancelCampaign(campaign, client, save)));
    return;
  }
  const result = await verifyCampaign(campaign, client);
  console.log(JSON.stringify(result));
  if (result.remaining) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
