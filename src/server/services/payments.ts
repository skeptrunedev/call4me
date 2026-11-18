/**
 * An email to Nick (ADMIN_EMAILS) for every payment: a card top-up, a monthly reload, or USDC over
 * x402, each a topup or reload in the ledger. Runs on the every-minute cron; as with signups
 * (signups.ts), each payment is claimed in payment_notices before sending and released if the send
 * fails, so every payment is announced once.
 */
import type { Messenger } from '../lib/messaging';
import { now } from '../lib/ids';
import { accountName } from './signups';

export interface Payment {
  id: string;
  account_id: string;
  amount_cents: number;
  kind: 'topup' | 'reload';
  /** How it was paid, as the ledger has it: "card", "card, reloads monthly", "monthly reload", "USDC (x402) from 0x...". */
  note: string | null;
  created_at: number;
  email: string;
  display_name: string | null;
  /** The account's payments up to and including this one, and what they add up to. */
  count: number;
  total_cents: number;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pacific = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function paymentEmail(p: Payment, origin: string): { subject: string; text: string } {
  const { who, full } = accountName(p.email, p.display_name);
  return {
    subject: `new Call for Me payment: ${dollars(p.amount_cents)} from ${who}`,
    text: [
      `${full} paid for ${dollars(p.amount_cents)} of credits (${p.note ?? p.kind}).`,
      p.count === 1 ? 'their first payment' : `payment ${p.count} from them, ${dollars(p.total_cents)} in all`,
      // ICU puts a narrow no-break space before "AM"; a plain one reads the same in any mail client.
      `when: ${pacific.format(p.created_at).replace(/\u202f/g, ' ')} PT`,
      `account: ${p.account_id}`,
      origin,
    ].join('\n'),
  };
}

export async function notifyPayments(opts: { db: D1Database; messenger: Messenger; to: string[]; origin: string; limit?: number }): Promise<{ sent: number; failed: number }> {
  const tally = { sent: 0, failed: 0 };
  if (opts.to.length === 0) return tally;
  const { results } = await opts.db
    .prepare(
      `SELECT l.id, l.account_id, l.amount_cents, l.kind, l.note, l.created_at, a.email, a.display_name,
              count(p.id) AS count, sum(p.amount_cents) AS total_cents
       FROM ledger l
       JOIN accounts a ON a.id = l.account_id
       JOIN ledger p ON p.account_id = l.account_id AND p.kind IN ('topup', 'reload') AND p.amount_cents > 0 AND p.created_at <= l.created_at
       WHERE l.kind IN ('topup', 'reload') AND l.amount_cents > 0
         AND NOT EXISTS (SELECT 1 FROM payment_notices n WHERE n.ledger_id = l.id)
       GROUP BY l.id
       ORDER BY l.created_at LIMIT ?`,
    )
    .bind(opts.limit ?? 50)
    .all<Payment>();
  for (const p of results) {
    const claim = await opts.db.prepare(`INSERT OR IGNORE INTO payment_notices (ledger_id, sent_at) VALUES (?, ?)`).bind(p.id, now()).run();
    if (!claim.meta.changes) continue;
    try {
      const { subject, text } = paymentEmail(p, opts.origin);
      for (const to of opts.to) await opts.messenger.sendEmail(to, subject, text);
      tally.sent++;
    } catch (err) {
      console.error('payment notice failed', p.id, String(err));
      await opts.db.prepare(`DELETE FROM payment_notices WHERE ledger_id = ?`).bind(p.id).run();
      tally.failed++;
    }
  }
  return tally;
}
