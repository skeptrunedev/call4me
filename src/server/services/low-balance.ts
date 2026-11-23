import { now } from '../lib/ids';
import { errorText } from '../lib/errors';
import { isRecipientRejected, makeMessenger, type Messenger } from '../lib/messaging';
import { accounts } from './accounts';
import { pricePerMinute } from './dialer';
import { addCreditsPath } from './drip';

/**
 * The email for a call refused because the balance can't pay for its first minute. The refusal
 * tells the agent to add credits, and the user may never see that: chloem0910's ChatGPT was
 * refused at $0.12 and nothing reached them (Nov 22, 2026). services/calls.ts records the refusal
 * on the account; the every-minute cron sends this with the add-credits link that goes straight to
 * Stripe Checkout (routes/public.tsx /add), at most once a day per account.
 */

const SUBJECT = 'Add credits to keep making calls';

/** A refusal older than this is stale: the user has moved on, and the email would read as spam. */
const FRESH_MS = 60 * 60_000;

/** At most one email a day, however often an agent retries a refused call. */
const EVERY_MS = 24 * 60 * 60_000;

/** How long a send keeps its claim, as for the low-credit hold email (services/low-credits.ts). */
const CLAIM_MS = 2 * 60_000;

/** Still worth sending at `?1`: a fresh refusal, no email in the last day, not claimed. */
const DUE = `low_balance_refused_at > ?1 - ${FRESH_MS}
  AND (low_balance_email_at IS NULL OR low_balance_email_at <= ?1 - ${EVERY_MS})
  AND (low_balance_email_claim_until IS NULL OR low_balance_email_claim_until <= ?1)`;

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function lowBalanceEmail(balanceCents: number, link: string): { text: string; html: string } {
  const text = `call4me couldn't place your last call: your balance is $${(Math.max(0, balanceCents) / 100).toFixed(2)}, less than a minute of calling.\n\nAdd credits, then ask your assistant to try again: ${link}`;
  const html = text.split('\n\n').map((p) => `<p>${esc(p).replace(esc(link), `<a href="${esc(link)}">add credits</a>`)}</p>`).join('\n');
  return { text, html };
}

/**
 * Email every account refused a call for its balance in the last hour, once a day at most. Credits
 * added since the refusal call it off. A claim keeps overlapping cron runs from sending twice; an
 * interrupted send is retried once it lapses, and an address that bounces isn't tried again for a
 * day. Returns the emails sent.
 */
export async function emailLowBalanceRefusals(env: Env, messenger: Messenger = makeMessenger(env), at = now()): Promise<number> {
  const db = env.DB;
  const { results } = await db.prepare(`SELECT id, email FROM accounts WHERE ${DUE}`).bind(at).all<{ id: string; email: string }>();
  let sent = 0;
  for (const { id, email } of results) {
    const until = at + CLAIM_MS;
    const claim = await db.prepare(`UPDATE accounts SET low_balance_email_claim_until = ?2 WHERE id = ?3 AND ${DUE}`).bind(at, until, id).run();
    if (!claim.meta.changes) continue;
    const release = (emailedAt: number | null) =>
      db.prepare(`UPDATE accounts SET low_balance_email_at = COALESCE(?, low_balance_email_at), low_balance_email_claim_until = NULL WHERE id = ? AND low_balance_email_claim_until = ?`).bind(emailedAt, id, until).run();
    try {
      if ((await accounts(db).fundsCents(id)) >= pricePerMinute(env)) {
        await db.prepare(`UPDATE accounts SET low_balance_refused_at = NULL, low_balance_email_claim_until = NULL WHERE id = ? AND low_balance_email_claim_until = ?`).bind(id, until).run();
        console.log('low balance email called off, credits were added', id);
        continue;
      }
      const link = `https://${env.CANONICAL_HOST}${await addCreditsPath(env.BETTER_AUTH_SECRET, id)}`;
      const { text, html } = lowBalanceEmail(await accounts(db).balanceCents(id), link);
      await messenger.sendEmail(email, SUBJECT, text, html);
      await release(at);
      console.log('low balance email sent', id);
      sent++;
    } catch (err) {
      console.error('low balance email failed', id, errorText(err));
      await release(isRecipientRejected(err) ? at : null);
    }
  }
  return sent;
}
