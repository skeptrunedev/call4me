/**
 * Top-up bonuses: Nick offers a customer extra credits on what they add ("next time you add
 * credits, i'll put an extra 20% on top"), and the promise has to hold whenever they pay, not when
 * someone happens to notice the payment. A bonus is set with npm run bonus (topup_bonuses); on the
 * every-minute cron, each card top-up, monthly reload or USDC payment made after it gets the bonus
 * as a ledger 'adjustment', and the customer is emailed what was added.
 *
 * Each payment is granted once: one batch claims the payment in topup_bonus_grants, writes the
 * ledger entry and spends a use, each only when the claim is this run's, so overlapping cron runs
 * can't both grant it, and a run that dies leaves nothing half done.
 */
import { newId, now } from '../lib/ids';
import { errorText } from '../lib/errors';
import { isRecipientRejected, makeMessenger, type Messenger } from '../lib/messaging';
import { accounts } from './accounts';

const SUBJECT = 'your call4me bonus credits';

/** How long an email send keeps its claim, as for the low-balance email (services/low-balance.ts). */
const CLAIM_MS = 2 * 60_000;

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function bonusEmail(g: { percent: number; payment_cents: number; bonus_cents: number }, balanceCents: number): string {
  return `your ${g.percent}% bonus is in: i added ${dollars(g.bonus_cents)} on top of the ${dollars(g.payment_cents)} you just added, so your balance is now ${dollars(Math.max(0, balanceCents))}.\n\n- nick`;
}

interface DuePayment {
  id: string;
  account_id: string;
  amount_cents: number;
  percent: number;
}

/** Grant every bonus that's due, then email each customer whose bonus hasn't been emailed. Returns the bonuses granted. */
export async function grantTopupBonuses(env: Env, messenger: Messenger = makeMessenger(env), at = now()): Promise<number> {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT l.id, l.account_id, l.amount_cents, b.percent
       FROM topup_bonuses b
       JOIN ledger l ON l.account_id = b.account_id AND l.kind IN ('topup', 'reload') AND l.amount_cents > 0 AND l.created_at >= b.created_at
       WHERE NOT EXISTS (SELECT 1 FROM topup_bonus_grants g WHERE g.payment_ledger_id = l.id)
       ORDER BY l.created_at`,
    )
    .all<DuePayment>();
  let granted = 0;
  for (const p of results) {
    const bonus = Math.round((p.amount_cents * p.percent) / 100);
    if (bonus <= 0) continue;
    const claim = newId();
    const ours = `EXISTS (SELECT 1 FROM topup_bonus_grants WHERE payment_ledger_id = ?1 AND claim = ?2)`;
    // A use spent by an earlier payment in this run (or a bonus turned off since) leaves nothing to claim.
    const [claimed] = await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO topup_bonus_grants (payment_ledger_id, account_id, payment_cents, bonus_cents, percent, claim, created_at)
           SELECT ?1, ?3, ?4, ?5, ?6, ?2, ?7 WHERE EXISTS (SELECT 1 FROM topup_bonuses WHERE account_id = ?3)`,
        )
        .bind(p.id, claim, p.account_id, p.amount_cents, bonus, p.percent, at),
      db
        .prepare(
          `INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at)
           SELECT ?3, ?4, ?5, 'adjustment', ?6, ?7, ?8 WHERE ${ours}`,
        )
        .bind(p.id, claim, newId(), p.account_id, bonus, `bonus:${p.id}`, `${p.percent}% top-up bonus`, at),
      // Last use first: spending a use first would leave 1 for the delete to see.
      db.prepare(`DELETE FROM topup_bonuses WHERE account_id = ?3 AND remaining = 1 AND ${ours}`).bind(p.id, claim, p.account_id),
      db.prepare(`UPDATE topup_bonuses SET remaining = remaining - 1 WHERE account_id = ?3 AND remaining > 1 AND ${ours}`).bind(p.id, claim, p.account_id),
    ]);
    if (!claimed.meta.changes) continue;
    console.log('top-up bonus granted', p.account_id, p.id, bonus);
    granted++;
  }
  await emailBonuses(env, messenger, at);
  return granted;
}

/** Email each granted bonus once. A failed send is retried on a later run; an address that rejects mail isn't. */
async function emailBonuses(env: Env, messenger: Messenger, at: number): Promise<void> {
  const db = env.DB;
  const due = `emailed_at IS NULL AND (email_claim_until IS NULL OR email_claim_until <= ?1)`;
  const { results } = await db
    .prepare(`SELECT g.payment_ledger_id, g.account_id, g.payment_cents, g.bonus_cents, g.percent, a.email FROM topup_bonus_grants g JOIN accounts a ON a.id = g.account_id WHERE ${due}`)
    .bind(at)
    .all<{ payment_ledger_id: string; account_id: string; payment_cents: number; bonus_cents: number; percent: number; email: string }>();
  for (const g of results) {
    const until = at + CLAIM_MS;
    const claim = await db.prepare(`UPDATE topup_bonus_grants SET email_claim_until = ?2 WHERE payment_ledger_id = ?3 AND ${due}`).bind(at, until, g.payment_ledger_id).run();
    if (!claim.meta.changes) continue;
    const release = (emailedAt: number | null) =>
      db.prepare(`UPDATE topup_bonus_grants SET emailed_at = ?, email_claim_until = NULL WHERE payment_ledger_id = ? AND email_claim_until = ?`).bind(emailedAt, g.payment_ledger_id, until).run();
    try {
      await messenger.sendEmail(g.email, SUBJECT, bonusEmail(g, await accounts(db).balanceCents(g.account_id)));
      await release(at);
      console.log('top-up bonus email sent', g.account_id);
    } catch (err) {
      console.error('top-up bonus email failed', g.account_id, errorText(err));
      await release(isRecipientRejected(err) ? at : null);
    }
  }
}
