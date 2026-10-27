/**
 * An email to Nick (ADMIN_EMAILS) for every new account. Runs on the cron with the drip; each
 * account is claimed in signup_notices before sending and released if the send fails, so every
 * signup is announced once.
 */
import type { Messenger } from '../lib/messaging';
import { now } from '../lib/ids';

export interface Signup {
  id: string;
  email: string;
  display_name: string | null;
  created_at: number;
  /** better-auth provider ("google", "twitter"), or null for an account a checkout created. */
  provider: string | null;
}

const PROVIDERS: Record<string, string> = { google: 'Google', twitter: 'X' };

export function signupEmail(s: Signup, origin: string): { subject: string; text: string } {
  const how = s.provider ? `signed in with ${PROVIDERS[s.provider] ?? s.provider}` : 'paid at checkout before signing in';
  const who = s.email.endsWith('.invalid') ? `${s.display_name ?? 'someone'} (no email)` : s.email;
  return {
    subject: `new Call for Me signup: ${who}`,
    text: [
      `${who}${s.display_name && !s.email.endsWith('.invalid') ? ` (${s.display_name})` : ''} ${how}.`,
      `when: ${new Date(s.created_at).toISOString().replace('T', ' ').slice(0, 16)} UTC`,
      `account: ${s.id}`,
      `give credits: npm run grant -- ${s.email} 25 "feedback credits"`,
      origin,
    ].join('\n'),
  };
}

export async function notifySignups(opts: { db: D1Database; messenger: Messenger; to: string[]; origin: string; limit?: number }): Promise<{ sent: number; failed: number }> {
  const tally = { sent: 0, failed: 0 };
  if (opts.to.length === 0) return tally;
  const { results } = await opts.db
    .prepare(
      `SELECT a.id, a.email, a.display_name, a.created_at,
              (SELECT p."providerId" FROM "account" p WHERE p."userId" = a.user_id LIMIT 1) AS provider
       FROM accounts a
       WHERE NOT EXISTS (SELECT 1 FROM signup_notices n WHERE n.account_id = a.id)
       ORDER BY a.created_at LIMIT ?`,
    )
    .bind(opts.limit ?? 50)
    .all<Signup>();
  for (const s of results) {
    const claim = await opts.db.prepare(`INSERT OR IGNORE INTO signup_notices (account_id, sent_at) VALUES (?, ?)`).bind(s.id, now()).run();
    if (!claim.meta.changes) continue;
    try {
      const { subject, text } = signupEmail(s, opts.origin);
      for (const to of opts.to) await opts.messenger.sendEmail(to, subject, text);
      tally.sent++;
    } catch (err) {
      console.error('signup notice failed', s.id, String(err));
      await opts.db.prepare(`DELETE FROM signup_notices WHERE account_id = ?`).bind(s.id).run();
      tally.failed++;
    }
  }
  return tally;
}
