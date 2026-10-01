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

interface Step {
  id: string;
  /** How long after signup the step is due, in ms. */
  after: number;
  email: (ctx: { origin: string }) => DripEmail;
}

/** The emails, in Nick's words. Add a step here to extend the drip. */
export const STEPS: Step[] = [
  {
    id: 'welcome',
    after: 0,
    email: ({ origin }) => ({
      subject: 'welcome to Call for Me',
      body: `hey, I'm Nick. I built Call for Me because I was trying to book some doctors' appointments and realized how silly it was that I still had to call into everything manually when AI was fully capable.

I went to go and try to find another service that could do this, but there was nothing that just worked out of the box. Call for Me does.

Hotels, airlines, restaurants, or anything else where it's easiest to just make a phone call. You can now have Call for Me do that on your behalf. It's really easy to use. Just visit the website (${origin}), load up some credits, and then copy the prompt into your coding agent of choice.

If you reply and send me feedback, I'm happy to give you $25 in credits. Anything about your experience would be useful, including how you found it and why you decided to sign up.

Here's my cell # for imessage or whatsapp - 7379832612 .

- Nick`,
    }),
  },
];

/** The unsubscribe link for an account, signed so it can't be forged for someone else. */
export async function unsubscribeUrl(origin: string, secret: string, accountId: string): Promise<string> {
  return `${origin}/unsubscribe?a=${encodeURIComponent(accountId)}&s=${await hmacHex(secret, `unsubscribe:${accountId}`)}`;
}

export async function validUnsubscribe(secret: string, accountId: string, sig: string): Promise<boolean> {
  return safeEqual(sig, await hmacHex(secret, `unsubscribe:${accountId}`));
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The email as sent: plain text plus an HTML version, where the unsubscribe link is just
 * the word "unsubscribe" (plain text can't hide a URL behind a word, so it shows it).
 */
export function render(email: DripEmail, unsubscribe: string): { subject: string; text: string; html: string } {
  const paragraphs = email.body.split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/https:\/\/[^\s)<]+/g, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br>')}</p>`);
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
        const { subject, text, html } = render(step.email({ origin: opts.origin }), await unsubscribeUrl(opts.origin, opts.secret, a.id));
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
