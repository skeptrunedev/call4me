/**
 * Signup drip: emails from Nick after someone signs up. Runs on the cron in wrangler.jsonc;
 * each step goes to an account at most once (drip_sends primary key).
 */
import { hmacHex, safeEqual } from '../lib/keys';
import type { Messenger } from '../lib/messaging';
import { now } from '../lib/ids';

export interface DripEmail {
  subject: string;
  /** Plain text; blank lines separate paragraphs. */
  body: string;
}

/**
 * An email's copy with placeholders: {addCredits} (this account's add-credits link, no scheme)
 * and {host} (the site as people type it). Stored in the email_templates table so the copy can
 * change without a deploy; STEPS holds the default each one falls back to.
 */
export type EmailTemplate = DripEmail;

export const PLACEHOLDERS = ['addCredits', 'host'] as const;

interface Step {
  id: string;
  /** How long after signup the step is due, in ms. */
  after: number;
  /** The copy used when the email_templates table has no valid row for this step. */
  template: EmailTemplate;
}

interface DripContext {
  /** The site's host as people type it ("call4.me"). */
  host: string;
  /** This account's add-credits link, without the scheme ("call4.me/add/..."). */
  addCredits: string;
}

/** The emails, in Nick's words. Add a step here to extend the drip. */
export const STEPS: Step[] = [
  {
    id: 'welcome',
    after: 0,
    template: {
      subject: 'welcome to Call for Me',
      body: `hey, I'm Nick, the creator of call4me. thank you so much for signing up! to get started, add credits at {addCredits} and paste the prompt from {host} into your agent.

If you reply with feedback, I'm happy to give you $25 in credits. Anything helps, including how you found it and why you signed up.

Here's my cell # for imessage or whatsapp - 7379832612 .

- Nick`,
    },
  },
];

/** Placeholders in a template that the code doesn't fill (a typo would reach people as "{...}"). */
export function unknownPlaceholders(t: EmailTemplate): string[] {
  const known = new Set<string>(PLACEHOLDERS);
  return [...new Set([...`${t.subject}\n${t.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((name) => !known.has(name)))];
}

/** The email for one account: the template with its placeholders filled. */
export function fill(t: EmailTemplate, ctx: DripContext): DripEmail {
  const sub = (s: string) => s.replace(/\{(addCredits|host)\}/g, (_, name: keyof DripContext) => ctx[name]);
  return { subject: sub(t.subject), body: sub(t.body) };
}

/**
 * The copy for a step: its email_templates row, or the code default when there's no row or the
 * row uses a placeholder the code can't fill.
 */
export async function templateFor(db: D1Database, step: Step): Promise<EmailTemplate> {
  const row = await db.prepare(`SELECT subject, body FROM email_templates WHERE key = ?`).bind(step.id).first<EmailTemplate>();
  if (!row) return step.template;
  const unknown = unknownPlaceholders(row);
  if (unknown.length) {
    console.error('email template has unknown placeholders, using the default', step.id, unknown.join(','));
    return step.template;
  }
  return { subject: row.subject, body: row.body };
}

/** The unsubscribe link for an account, signed so it can't be forged for someone else. */
export async function unsubscribeUrl(origin: string, secret: string, accountId: string): Promise<string> {
  return `${origin}/unsubscribe?a=${encodeURIComponent(accountId)}&s=${await hmacHex(secret, `unsubscribe:${accountId}`)}`;
}

export async function validUnsubscribe(secret: string, accountId: string, sig: string): Promise<boolean> {
  return safeEqual(sig, await hmacHex(secret, `unsubscribe:${accountId}`));
}

/** Signature characters in an add-credits code: 64 bits, short enough to read in an email. */
const ADD_SIG_LENGTH = 16;

const addSig = async (secret: string, accountId: string) => (await hmacHex(secret, `add-credits:${accountId}`)).slice(0, ADD_SIG_LENGTH);

/**
 * The add-credits path for an account (/add/<account>-<signature>), signed so a link can only
 * buy credits for the account it was sent to.
 */
export async function addCreditsPath(secret: string, accountId: string): Promise<string> {
  return `/add/${encodeURIComponent(accountId)}-${await addSig(secret, accountId)}`;
}

/** The account an add-credits code is for, or null when it isn't one we signed. */
export async function addCreditsAccount(secret: string, code: string): Promise<string | null> {
  const cut = code.lastIndexOf('-');
  if (cut <= 0) return null;
  const accountId = code.slice(0, cut);
  return safeEqual(code.slice(cut + 1), await addSig(secret, accountId)) ? accountId : null;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Links in an email body: full https URLs, and the site's own host written bare ("call4.me/add/..."). */
const linkPattern = (host: string) => new RegExp(`https://[^\\s)<]*[^\\s)<.,!?]|\\b${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/[^\\s)<]*[^\\s)<.,!?])?`, 'g');

/**
 * The email as sent: plain text plus an HTML version, where the unsubscribe link is just
 * the word "unsubscribe" (plain text can't hide a URL behind a word, so it shows it).
 * Links to the site are written without the scheme; the HTML version links them.
 */
export function render(email: DripEmail, unsubscribe: string, host = 'call4.me'): { subject: string; text: string; html: string } {
  const link = (u: string) => `<a href="${u.startsWith('https://') ? u : `https://${u}`}">${u}</a>`;
  const paragraphs = email.body.split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(linkPattern(host), link).replace(/\n/g, '<br>')}</p>`);
  return {
    subject: email.subject,
    text: `${email.body}\n\nunsubscribe: ${unsubscribe}`,
    html: `${paragraphs.join('\n')}\n<p style="font-size:12px;color:#888"><a href="${esc(unsubscribe)}" style="color:#888">unsubscribe</a></p>`,
  };
}

interface Candidate {
  id: string;
  email: string;
  created_at: number;
}

/**
 * Send every due drip email. Claims a step before sending and releases the claim if the
 * send fails, so a retry on the next run sends it once.
 */
export async function runDrip(opts: {
  db: D1Database;
  messenger: Messenger;
  origin: string;
  secret: string;
  start: number;
  limit?: number;
}): Promise<{ sent: number; failed: number }> {
  const t = now();
  const tally = { sent: 0, failed: 0 };
  for (const step of STEPS) {
    const template = await templateFor(opts.db, step);
    const { results } = await opts.db
      .prepare(
        `SELECT id, email, created_at FROM accounts
         WHERE created_at >= ?1 AND created_at <= ?2 AND email_opt_out = 0
           AND email NOT LIKE '%.invalid'
           AND NOT EXISTS (SELECT 1 FROM drip_sends d WHERE d.account_id = accounts.id AND d.step = ?3)
         ORDER BY created_at LIMIT ?4`,
      )
      .bind(opts.start, t - step.after, step.id, opts.limit ?? 50)
      .all<Candidate>();
    for (const a of results) {
      const claim = await opts.db.prepare(`INSERT OR IGNORE INTO drip_sends (account_id, step, sent_at) VALUES (?, ?, ?)`).bind(a.id, step.id, t).run();
      if (!claim.meta.changes) continue;
      try {
        const host = new URL(opts.origin).host;
        const email = fill(template, { host, addCredits: `${host}${await addCreditsPath(opts.secret, a.id)}` });
        const { subject, text, html } = render(email, await unsubscribeUrl(opts.origin, opts.secret, a.id), host);
        await opts.messenger.sendEmail(a.email, subject, text, html);
        tally.sent++;
      } catch (err) {
        console.error('drip send failed', step.id, a.id, String(err));
        await opts.db.prepare(`DELETE FROM drip_sends WHERE account_id = ? AND step = ?`).bind(a.id, step.id).run();
        tally.failed++;
      }
    }
  }
  return tally;
}
