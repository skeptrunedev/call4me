/**
 * Signup drip: short plain-text emails from Nick after someone signs up, picked by what they
 * have done so far (loaded credits, connected an agent, made a call). Runs on the cron in
 * wrangler.jsonc; each step goes to an account at most once (drip_sends primary key).
 */
import { hmacHex, safeEqual } from '../lib/keys';
import type { Messenger } from '../lib/messaging';
import { now } from '../lib/ids';

const HOUR = 3600 * 1000;

/** What someone has done so far, which decides what the next email says. */
export interface DripState {
  funded: boolean;
  connected: boolean;
  calls: number;
}

export interface DripEmail {
  subject: string;
  body: string;
}

interface Step {
  id: 'welcome' | 'day1' | 'day4';
  /** How long after signup the step is due. */
  after: number;
  /** The email for this person, or null to skip the step for them. */
  email: (s: DripState, ctx: { origin: string; pricePerMinuteCents: number }) => DripEmail | null;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;

export const STEPS: Step[] = [
  {
    id: 'welcome',
    after: 0,
    email: (s, { origin }) => ({
      subject: 'welcome to callbay',
      body: `hey, it's nick. i built callbay.

thanks for signing up. the short version: your agent (claude code, codex, claude desktop, chatgpt) gets one tool that makes real phone calls. ask it to book a table or get you a dentist appointment, it calls, and it tells you what happened.

${s.funded ? '' : `to make calls, load some credits (from $10): ${origin}/#buy\n`}then paste the install prompt into your agent and it sets itself up: ${origin}/mcp

what's the first call you want it to make? just reply, i read every email.

nick`,
    }),
  },
  {
    id: 'day1',
    after: 24 * HOUR,
    email: (s, { origin, pricePerMinuteCents }) => {
      if (s.calls > 0) return null;
      if (!s.funded)
        return {
          subject: 'your first call',
          body: `hey, nick again.

you signed up yesterday but haven't loaded credits yet. calls are ${dollars(pricePerMinuteCents)} a minute of talk time, unanswered calls are free, and $10 covers about ${Math.floor(1000 / pricePerMinuteCents)} minutes.

${origin}/#buy

if something stopped you, reply and tell me. i'll fix it.

nick`,
        };
      if (!s.connected)
        return {
          subject: 'one step left',
          body: `hey, nick again.

your credits are in, but no agent is connected yet. copy the prompt at ${origin}/mcp and paste it into claude code, codex, claude desktop, or chatgpt. it installs callbay itself.

stuck anywhere? reply and i'll help.

nick`,
        };
      return {
        subject: 'try your first call',
        body: `hey, nick again.

you're all set up. a few things to try, word for word:

- "call the pizza place near me and ask how late they deliver tonight"
- "book me a haircut this week after 5pm"
- "call my dentist and move my cleaning to next week"

your agent asks you for anything it needs before it dials.

nick`,
      };
    },
  },
  {
    id: 'day4',
    after: 96 * HOUR,
    email: (s) =>
      s.calls > 0
        ? {
            subject: 'how did it go?',
            body: `hey, it's nick.

you've made ${s.calls === 1 ? 'a call' : `${s.calls} calls`} with callbay. how did it go? anything it got wrong, or anything you wish it could call about?

reply and tell me. i read and answer every one.

nick`,
          }
        : {
            subject: 'anything in the way?',
            body: `hey, it's nick.

you signed up a few days ago but haven't made a call yet. is something in the way? reply with what you wanted to call about and i'll help you get it done, or fix whatever broke.

nick`,
          },
  },
];

/** The unsubscribe link for an account, signed so it can't be forged for someone else. */
export async function unsubscribeUrl(origin: string, secret: string, accountId: string): Promise<string> {
  return `${origin}/unsubscribe?a=${encodeURIComponent(accountId)}&s=${await hmacHex(secret, `unsubscribe:${accountId}`)}`;
}

export async function validUnsubscribe(secret: string, accountId: string, sig: string): Promise<boolean> {
  return safeEqual(sig, await hmacHex(secret, `unsubscribe:${accountId}`));
}

export function withFooter(email: DripEmail, unsubscribe: string): DripEmail {
  return { ...email, body: `${email.body}\n\n--\nnot useful? unsubscribe: ${unsubscribe}` };
}

interface Candidate {
  id: string;
  email: string;
  user_id: string | null;
  key_prefix: string | null;
  created_at: number;
}

async function stateOf(db: D1Database, a: Candidate): Promise<DripState> {
  const row = await db
    .prepare(
      `SELECT
         EXISTS (SELECT 1 FROM ledger WHERE account_id = ?1 AND kind IN ('topup', 'reload')) AS funded,
         (SELECT COUNT(*) FROM calls WHERE account_id = ?1 AND direction = 'outbound') AS calls,
         EXISTS (SELECT 1 FROM "oauthAccessToken" WHERE "userId" = ?2) AS oauth`,
    )
    .bind(a.id, a.user_id)
    .first<{ funded: number; calls: number; oauth: number }>();
  const calls = row?.calls ?? 0;
  return { funded: Boolean(row?.funded), calls, connected: Boolean(row?.oauth) || a.key_prefix !== null || calls > 0 };
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
  pricePerMinuteCents: number;
  limit?: number;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  const t = now();
  const tally = { sent: 0, skipped: 0, failed: 0 };
  for (const step of STEPS) {
    const { results } = await opts.db
      .prepare(
        `SELECT id, email, user_id, key_prefix, created_at FROM accounts
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
      const email = step.email(await stateOf(opts.db, a), { origin: opts.origin, pricePerMinuteCents: opts.pricePerMinuteCents });
      if (!email) {
        tally.skipped++;
        continue;
      }
      try {
        const { subject, body } = withFooter(email, await unsubscribeUrl(opts.origin, opts.secret, a.id));
        await opts.messenger.sendEmail(a.email, subject, body);
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
