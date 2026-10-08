/** Schedule an approved email for a snapshot of eligible accounts using native Fastmail delivery.
 * prepare records private unsubscribe tokens; schedule is the explicit external mail action.
 * Keep state in ignored scratch/, never commit recipient addresses or signed unsubscribe links.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { cliD1 } from './d1-cli';
import { fastmail, parseMessage } from './outreach-mail.mjs';
import { createCampaignUnsubscribes } from '../src/server/services/campaign-unsubscribe';

export interface Recipient {
  accountId: string;
  email: string;
  text: string;
  state: 'prepared' | 'drafted' | 'scheduling' | 'scheduled' | 'skipped';
  emailId?: string;
  submissionId?: string;
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
  createDraft(message: { to: string; subject: string; text: string }): Promise<{ id: string }>;
  scheduleDraft(message: { id: string; to: string; subject: string; text: string; sendAt: string }): Promise<{ submissionId: string }>;
  submissionsForEmail(id: string): Promise<Submission[]>;
  submissions(ids: string[]): Promise<{ list: Submission[]; notFound?: string[] }>;
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

export function fingerprint(campaign: Pick<Campaign, 'subject' | 'sendAt' | 'recipients'>) {
  return createHash('sha256').update(JSON.stringify({ subject: campaign.subject, sendAt: campaign.sendAt,
    recipients: campaign.recipients.map(({ accountId, email, text }) => ({ accountId, email, text })) })).digest('hex');
}

export function verifyScheduled(submission: Submission | undefined, recipient: Recipient, sendAt: string) {
  if (!submission || submission.emailId !== recipient.emailId || submission.sendAt !== sendAt || submission.undoStatus !== 'pending') {
    throw new Error(`Unverified schedule for account ${recipient.accountId}; inspect submission ${submission?.id ?? recipient.submissionId ?? 'unknown'} before retrying`);
  }
}

/** Persist before submission so an interrupted request is inspected rather than repeated. */
export async function scheduleCampaign(campaign: Campaign, client: Client, save: () => void, eligible: Set<string>) {
  if (campaign.fingerprint !== fingerprint(campaign)) throw new Error('Campaign content or audience changed after preparation');
  if (Date.parse(campaign.sendAt) <= Date.now()) throw new Error('Schedule is no longer in the future');
  for (const recipient of campaign.recipients) {
    if (recipient.state === 'skipped' || recipient.state === 'scheduled') continue;
    // Resolve uncertain prior submissions before considering any new write.
    if (recipient.state === 'scheduling') {
      const prior = (await client.submissionsForEmail(recipient.emailId!)).filter(s => s.undoStatus !== 'canceled');
      if (prior.length !== 1) throw new Error(`Uncertain submission for account ${recipient.accountId}; inspect email ${recipient.emailId}, do not automatically resend`);
      verifyScheduled(prior[0], recipient, campaign.sendAt);
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
    const message = { to: recipient.email, subject: campaign.subject, text: recipient.text };
    if (recipient.state === 'prepared') {
      const draft = await client.createDraft(message);
      recipient.emailId = draft.id;
      recipient.state = 'drafted';
      save();
    }
    recipient.state = 'scheduling';
    save();
    const result = await client.scheduleDraft({ ...message, id: recipient.emailId!, sendAt: campaign.sendAt });
    recipient.submissionId = result.submissionId;
    recipient.state = 'scheduled';
    save();
  }
}

export async function verifyCampaign(campaign: Campaign, client: Client) {
  if (campaign.fingerprint !== fingerprint(campaign)) throw new Error('Campaign content or audience changed');
  const scheduled = campaign.recipients.filter(r => r.state === 'scheduled');
  const pending = campaign.recipients.filter(r => !['scheduled', 'skipped'].includes(r.state));
  for (let offset = 0; offset < scheduled.length; offset += 100) {
    const batch = scheduled.slice(offset, offset + 100);
    const result = await client.submissions(batch.map(r => r.submissionId!));
    for (const recipient of batch) verifyScheduled(result.list.find(s => s.id === recipient.submissionId), recipient, campaign.sendAt);
  }
  return { sendAt: campaign.sendAt, scheduled: scheduled.length, remaining: pending.length,
    skipped: campaign.recipients.filter(r => r.state === 'skipped').length };
}

function exclusions() {
  const config = readFileSync(new URL('../dashboard/wrangler.jsonc', import.meta.url), 'utf8');
  const emails = /"INTERNAL_EMAILS"\s*:\s*"([^"]+)"/.exec(config)?.[1];
  if (!emails) throw new Error('Dashboard INTERNAL_EMAILS is missing');
  return emails.split(',');
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    state: { type: 'string' }, file: { type: 'string' }, at: { type: 'string' },
  } });
  const [action] = positionals;
  if (positionals.length !== 1 || !['prepare', 'schedule', 'status'].includes(action) || !values.state) {
    throw new Error('Usage: campaign prepare --file MESSAGE --at UTC_TIMESTAMP --state PRIVATE_JSON | schedule|status --state PRIVATE_JSON');
  }
  const statePath = resolve(values.state);
  if (action === 'prepare') {
    if (!values.file || !values.at || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(values.at) || !Number.isFinite(Date.parse(values.at)) || Date.parse(values.at) <= Date.now()) throw new Error('A message file and future UTC timestamp are required');
    if (existsSync(statePath)) throw new Error('Campaign state file already exists');
    const message = parseMessage(readFileSync(values.file, 'utf8'));
    const rows = await eligibleRecipients(cliD1(), exclusions());
    if (!rows.length) throw new Error('No eligible recipients');
    const links = await createCampaignUnsubscribes(cliD1(), 'https://call4.me', rows.map(row => row.id));
    const linkByAccount = new Map(links.map(link => [link.accountId, link.url]));
    const firstUnsubscribe = links[0].url;
    // This GET only renders a confirmation form; the opt out requires a separate POST.
    const confirmation = await fetch(firstUnsubscribe, { method: 'GET', signal: AbortSignal.timeout(20000) });
    if (confirmation.status !== 200 || !(await confirmation.text()).includes('action="/unsubscribe"')) {
      throw new Error('Campaign unsubscribe link does not produce a valid production confirmation page');
    }
    const recipients: Recipient[] = rows.map(row => ({ accountId: row.id, email: row.email,
      text: `${message.text}\n\n[unsubscribe](${linkByAccount.get(row.id)!})`, state: 'prepared' }));
    const campaign: Campaign = { version: 1, createdAt: new Date().toISOString(), sendAt: values.at, subject: message.subject, recipients, fingerprint: '' };
    campaign.fingerprint = fingerprint(campaign);
    mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
    writeFileSync(statePath, JSON.stringify(campaign, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ prepared: recipients.length, sendAt: campaign.sendAt, subject: campaign.subject, stateFile: statePath }));
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
  const result = await verifyCampaign(campaign, client);
  console.log(JSON.stringify(result));
  if (result.remaining) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
