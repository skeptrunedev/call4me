import { now } from '../lib/ids';
import { errorText } from '../lib/errors';
import { isRecipientRejected, makeMessenger, type Messenger } from '../lib/messaging';
import { accounts } from './accounts';
import { LIMITS, type CallRow } from './call-store';
import { callPrice } from './dialer';
import { addCreditsPath } from './drip';

/**
 * The email for a call on hold that is about to run out of credits. A hold that runs past the
 * call's time limit holds more credits there and keeps waiting; one the balance can't fund wraps up
 * and loses its place in the queue. The voice session sees that coming and records it on the call
 * (callStore.lowCredits): it alone knows the call's limit, and the voice Worker has no mail
 * credentials. This sends it, every minute, while the call is still on hold and before it wraps up.
 * Credits added in time are held at the next limit like any others, and a warning they made untrue
 * before it went out is called off instead (fundsNextExtension).
 */

/**
 * Whether the account can now fund its call's next hold extension in full, the test the voice
 * session warned on (holdCreditsRunOutAt): credits were added since, and the hold carries on.
 * call_qz3qenug5hlh2wp0's owner added $10 at 10:17:52 PM PT and was emailed at 10:19 that their
 * call was about to run out, inviting a second payment.
 */
async function fundsNextExtension(env: Env, row: CallRow): Promise<boolean> {
  return (await accounts(env.DB).fundsCents(row.account_id)) >= LIMITS.holdExtensionMinutes * callPrice(env, row);
}

/**
 * How long a send keeps its claim. Overlapping cron runs don't send twice, and an interrupted send
 * is retried once it lapses: sooner than the number renewal email's five minutes, since a warning
 * leaves the user minutes, not days.
 */
const CLAIM_MS = 2 * 60_000;

const SUBJECT = 'Your call on hold is about to run out of credits';

/**
 * How long the current hold must have lasted before its warning goes out. The voice session queues
 * the warning as soon as a hold starts near the time limit, and a recorded greeting or menu counts as
 * hold: Tokyo Disney Resort's recording ended after 56s, a person answered, and the user had already
 * been told their hold was running out with 24 minutes of credits left (call_9pcdwl0vhq0l82iy). A
 * hold that lasts this long is a real one, and the wait costs the warning little of its lead.
 */
const SETTLED_HOLD_MS = 2 * 60_000;

/** A deadline this close is warned about as soon as the hold starts: every minute of notice counts. */
const URGENT_MS = 5 * 60_000;

/**
 * Still worth sending at `?1`: on hold, long enough to be a real hold or with the deadline close,
 * before that deadline, and not already sent, refused or claimed.
 */
const DUE = `status = 'in_progress' AND hold_since IS NOT NULL AND low_credit_deadline_at > ?1
  AND (hold_since <= ?1 - ${SETTLED_HOLD_MS} OR low_credit_deadline_at <= ?1 + ${URGENT_MS})
  AND low_credit_email_sent_at IS NULL AND low_credit_email_rejected_at IS NULL
  AND (low_credit_email_claim_until IS NULL OR low_credit_email_claim_until <= ?1)`;

/** A call DUE selects: on hold, with a deadline. */
type Due = CallRow & { hold_since: number; low_credit_deadline_at: number };

const minutes = (n: number) => (n === 1 ? 'minute' : 'minutes');

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The email's text at `at`, in minutes from then: the user's timezone isn't known, so no clock times.
 * The business is left out for zero data retention, which deletes it with the call's content
 * (services/zdr.ts), and for incoming calls, whose row names the task or "incoming call".
 */
function lowCreditEmail(row: Due, link: string, at: number): { text: string; html: string } {
  const call = row.direction === 'outbound' && !row.zdr ? `Your call to ${row.business}` : 'Your call';
  const held = Math.max(1, Math.floor((at - row.hold_since) / 60_000));
  const left = Math.max(1, Math.floor((row.low_credit_deadline_at - at) / 60_000));
  const text = `${call} has been on hold for ${held} ${minutes(held)}. Your credits cover about ${left} more ${minutes(left)}, then call4me will hang up and the call will lose its place in the queue.\n\nAdd credits and the call keeps holding: ${link}`;
  const html = text.split('\n\n').map((p) => `<p>${esc(p).replace(esc(link), `<a href="${esc(link)}">add credits</a>`)}</p>`).join('\n');
  return { text, html };
}

/**
 * Email every call the voice session found running out of credits on hold, once each. A claim keeps
 * overlapping cron runs from sending the same one; an interrupted send is retried after it lapses.
 * SMTP has no idempotency key, so a crash after delivery but before recording it can still send a
 * duplicate, rather than losing the warning. A call off hold right now is left for a later run, in
 * case the hold comes back before the deadline. Returns the emails sent.
 */
export async function warnLowCreditHolds(env: Env, messenger: Messenger = makeMessenger(env), at = now()): Promise<number> {
  const db = env.DB;
  const { results } = await db.prepare(`SELECT * FROM calls WHERE ${DUE}`).bind(at).all<Due>();
  let sent = 0;
  for (const row of results) {
    const { id } = row;
    const until = at + CLAIM_MS;
    // Claimed only while still due, so the row read above still describes the call.
    const claim = await db.prepare(`UPDATE calls SET low_credit_email_claim_until = ?2 WHERE id = ?3 AND ${DUE}`).bind(at, until, id).run();
    if (!claim.meta.changes) continue;
    try {
      if (await fundsNextExtension(env, row)) {
        // Called off for good: no deadline is no longer due, and the session warns once per call.
        await db.prepare(`UPDATE calls SET low_credit_deadline_at = NULL, low_credit_email_claim_until = NULL WHERE id = ? AND low_credit_email_claim_until = ?`).bind(id, until).run();
        console.log('low credit warning called off, credits were added', id);
        continue;
      }
      const account = await accounts(db).byId(row.account_id);
      if (!account) throw new Error('low credit call account missing');
      const link = `https://${env.CANONICAL_HOST}${await addCreditsPath(env.BETTER_AUTH_SECRET, row.account_id)}`;
      const { text, html } = lowCreditEmail(row, link, at);
      await messenger.sendEmail(account.email, SUBJECT, text, html);
      await db.prepare(`UPDATE calls SET low_credit_email_sent_at = ?, low_credit_email_claim_until = NULL WHERE id = ? AND low_credit_email_claim_until = ?`).bind(at, id, until).run();
      sent++;
    } catch (err) {
      console.error('low credit hold email failed', id, errorText(err));
      await db
        .prepare(`UPDATE calls SET low_credit_email_rejected_at = ?, low_credit_email_claim_until = NULL WHERE id = ? AND low_credit_email_claim_until = ?`)
        .bind(isRecipientRejected(err) ? at : null, id, until)
        .run();
    }
  }
  return sent;
}
