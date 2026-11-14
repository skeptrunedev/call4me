import { now } from '../lib/ids';
import { telnyx } from '../lib/telnyx';
import { sessionFor } from '../voice/stub';
import type { Brief, CallRow } from './calls';
import { carrierRecordings } from './recordings';

/**
 * Zero data retention: an account turns it on (/account), and every call it places or answers
 * from then on is stamped zdr, billed at 1.5x (lib/rates.ts zdrPrice), never monitored, and has
 * its content kept only long enough for the agent to collect the result: ZDR_KEEP_MS after the
 * call ends, everything that says what it was about is deleted. That is the brief, goal and
 * business name, the transcript, the recap, the questions asked mid-call, the ledger's notes, the
 * voice session's stored setup (which holds the call's PINs) and the carrier's recordings (the
 * call's and, when the person joined, their own leg's). What billing and abuse prevention need
 * stays: the numbers, the times, the length and the cost.
 */
export const ZDR_KEEP_MS = 60 * 60_000;

/** What a deleted call's business name reads as on the account page and in the agent's tools. */
export const DELETED = 'deleted (zero data retention)';

const EMPTY_BRIEF: Brief = { on_behalf_of: '', facts: '', flexibility: '', timezone: null, max_minutes: 0 };

/** Calls purged per cron run: each costs several carrier, voice session and D1 requests. */
const BATCH = 10;

/** The first retry of a failed purge, and the most it ever waits between tries (an hour is long enough to miss the hourly promise). */
export const RETRY_FIRST_MS = 5 * 60_000;
const RETRY_LAST_MS = 60 * 60_000;

/**
 * How long a failed purge waits before trying again: doubling from RETRY_FIRST_MS, capped at
 * RETRY_LAST_MS. A carrier outage therefore costs a handful of attempts, not one a minute, and
 * the calls behind a stuck one keep being purged.
 */
export const retryDelayMs = (attempts: number) => Math.min(RETRY_FIRST_MS * 2 ** Math.max(0, attempts - 1), RETRY_LAST_MS);

/**
 * Deletes the content of zero data retention calls that ended more than ZDR_KEEP_MS ago. The D1
 * content goes first, every time; the call counts as purged only once its voice session storage
 * and carrier recordings are gone too, so a carrier outage is retried later. A failed call is put
 * back with a growing delay rather than at the head of the queue, so it never starves the rest.
 */
export async function purgeZdrCalls(env: Env, at = now()): Promise<number> {
  // A schedule cleanup that fails must not stop the calls' content from being purged.
  await purgeZdrSchedules(env, at).catch((err) => console.error('zero data retention schedule cleanup failed', String(err)));
  const { results } = await env.DB.prepare(
    `SELECT id, telnyx_call_control_id, purge_attempts FROM calls
      WHERE zdr = 1 AND purged_at IS NULL AND ended_at IS NOT NULL AND ended_at < ?
        AND (purge_next_at IS NULL OR purge_next_at <= ?)
      ORDER BY ended_at LIMIT ${BATCH}`,
  )
    .bind(at - ZDR_KEEP_MS, at)
    .all<Pick<CallRow, 'id' | 'telnyx_call_control_id' | 'purge_attempts'>>();
  let purged = 0;
  for (const row of results) {
    const id = row.id;
    try {
      await env.DB.batch([
        env.DB.prepare(`UPDATE calls SET business = ?, goal = '', brief = ?, transcript = NULL, outcome = NULL, end_reason = NULL WHERE id = ?`).bind(DELETED, JSON.stringify(EMPTY_BRIEF), id),
        env.DB.prepare(`DELETE FROM call_questions WHERE call_id = ?`).bind(id),
        env.DB.prepare(`UPDATE scheduled_calls SET business = ?, goal = '', input = '{}' WHERE call_id = ?`).bind(DELETED, id),
        // The call's hold, its extensions (hold:<id>:<n>), the release and the charge.
        env.DB.prepare(`UPDATE ledger SET note = 'call' WHERE ref IN (?, ?, ?) OR (ref > ? AND ref < ?)`).bind(`hold:${id}`, `release:${id}`, `call:${id}`, `hold:${id}:`, `hold:${id};`),
      ]);
      const forgot = await sessionFor(env, id).fetch('https://session/forget', { method: 'POST' });
      if (!forgot.ok) throw new Error(`the voice session kept its storage (${forgot.status} ${await forgot.text()})`);
      const carrier = telnyx(env);
      const recordings = await carrierRecordings(env, row);
      // The person's own leg, when they were rung to join, is recorded on its own.
      for (const leg of await carrier.personLegs(id)) recordings.push(...(await carrier.recordings(leg.controlId, leg.legId)));
      for (const recording of recordings) await carrier.deleteRecording(recording.id);
    } catch (err) {
      const attempts = (row.purge_attempts ?? 0) + 1;
      const next = at + retryDelayMs(attempts);
      await env.DB.prepare(`UPDATE calls SET purge_attempts = ?, purge_next_at = ? WHERE id = ?`)
        .bind(attempts, next, id)
        .run()
        .catch((e) => console.error('zero data retention retry not recorded', id, String(e)));
      console.error('zero data retention purge incomplete, retrying later', id, `attempt ${attempts}`, `not before ${new Date(next).toISOString()}`, String(err));
      continue;
    }
    await env.DB.prepare(`UPDATE calls SET purged_at = ? WHERE id = ?`).bind(at, id).run();
    purged++;
  }
  return purged;
}

/**
 * Schedules that never became calls (missed, canceled) hold the same content: their business,
 * goal and the details the caller was given. The account's setting decides, since a schedule made
 * before it was turned on may be missed after it, and nothing was ever said on the phone.
 */
async function purgeZdrSchedules(env: Env, at: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE scheduled_calls SET business = ?, goal = '', input = '{}'
      WHERE call_id IS NULL AND status IN ('failed', 'canceled') AND call_at < ?
        AND (business <> ? OR goal <> '' OR input <> '{}')
        AND account_id IN (SELECT id FROM accounts WHERE zdr = 1)`,
  )
    .bind(DELETED, at - ZDR_KEEP_MS, DELETED)
    .run();
}
