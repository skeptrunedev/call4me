import { newId, now } from '../lib/ids';
import { formatPhone } from '../lib/phone';
import { accounts, type Account } from './accounts';
import { CallError, calls, localTimeIn, type PlaceCallInput } from './calls';
import { placeCall, type Voice } from './dialer';
import type { Surface } from './intake';

/**
 * Calls placed later: "call Canby Utility Monday when they open". Scheduling checks everything
 * placing the call would refuse, short of money, and the minute cron (placeDueCalls) dials it when
 * it comes due through the same placeCall as call4me_place_call. Nobody may be watching then, so
 * the call has to carry everything it needs.
 */

export type ScheduledStatus = 'pending' | 'dialing' | 'placed' | 'failed' | 'canceled';

export interface ScheduledRow {
  id: string;
  account_id: string;
  call_at: number;
  to_number: string;
  business: string;
  goal: string;
  input: string;
  surface: Surface;
  status: ScheduledStatus;
  call_id: string | null;
  error: string | null;
  created_at: number;
}

export type ScheduledInput = PlaceCallInput & { voice?: Voice };

export const SCHEDULE_LIMITS = {
  /** How far ahead a call can be scheduled. */
  maxAheadMs: 60 * 24 * 60 * 60 * 1000,
  /** Calls waiting to dial, per account. */
  maxPending: 25,
  /**
   * A call the cron could not dial within this long of its time (an outage) is not dialed at all:
   * an hour late may be after the business closed, or after the user stopped expecting it.
   */
  missedAfterMs: 30 * 60 * 1000,
  /** A claimed call still not placed after this long was lost with the run dialing it. */
  staleDialingMs: 10 * 60 * 1000,
};

export const isScheduledId = (id: string) => id.startsWith('sched_');

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const WITH_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * When call_at means, in ms since epoch: an ISO time with an offset as given, or a wall-clock time
 * ("2026-10-05T09:15") in the business's IANA time zone.
 */
export function parseCallAt(callAt: string, timezone: string | undefined): number {
  const text = callAt.trim();
  if (WITH_OFFSET.test(text)) {
    const at = Date.parse(text);
    if (Number.isNaN(at)) throw new CallError(`call_at: "${callAt}" is not a time like 2026-10-05T09:15:00-07:00`);
    return at;
  }
  const m = WALL_TIME.exec(text);
  if (!m) throw new CallError(`call_at: "${callAt}" is not a time like 2026-10-05T09:15 (with timezone) or 2026-10-05T09:15:00-07:00`);
  if (!timezone) throw new CallError('call_at has no UTC offset: pass timezone (the business\'s IANA time zone, e.g. "America/Los_Angeles") or give call_at an offset');
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0));
  return wallTimeIn(timezone, Date.UTC(y, mo - 1, d, h, mi, s));
}

/** The instant a zone's clocks read `wall` (that wall time written as if it were UTC). */
function wallTimeIn(timezone: string, wall: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  // The offset at the wall time read as UTC can be the other side of a DST change; one more step settles it.
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

export function scheduledView(row: ScheduledRow) {
  const input = JSON.parse(row.input) as ScheduledInput;
  return {
    id: row.id,
    status: row.status,
    call_at: new Date(row.call_at).toISOString(),
    call_at_local: localTimeIn(input.timezone ?? null, new Date(row.call_at)),
    business: row.business,
    number: formatPhone(row.to_number),
    goal: row.goal,
    call_id: row.call_id,
    error: row.error,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export type ScheduledView = ReturnType<typeof scheduledView>;

export function scheduledText(v: ScheduledView): string {
  const when = v.call_at_local ? `${v.call_at_local} (${v.call_at})` : v.call_at;
  const state = {
    pending: `dials ${when}`,
    dialing: `dialing now (due ${when})`,
    placed: `placed ${when} as ${v.call_id}; call4me_get_call ${v.call_id} has how it went`,
    failed: `not placed (due ${when}): ${v.error}`,
    canceled: `canceled (was due ${when})`,
  }[v.status];
  return `${v.id} · scheduled · ${v.business} ${v.number} · ${state}`;
}

export function scheduledCalls(db: D1Database) {
  return {
    /** Check the call as call4me_place_call would, short of money, and save it to dial at callAt. */
    async schedule(account: Account, input: ScheduledInput, callAt: string, surface: Surface, at = now()): Promise<ScheduledRow> {
      const when = parseCallAt(callAt, input.timezone);
      if (when <= at) throw new CallError(`call_at ${new Date(when).toISOString()} has already passed (it is ${new Date(at).toISOString()}); to call now, use call4me_place_call`);
      if (when - at > SCHEDULE_LIMITS.maxAheadMs) throw new CallError(`call_at: calls can be scheduled up to ${SCHEDULE_LIMITS.maxAheadMs / 86_400_000} days ahead`);
      const { to, intake } = await calls(db).validate(account, input, surface, 'call4me_schedule_call');
      const secret = intake.known.find((k) => k.sensitive);
      if (secret) {
        throw new CallError(`this call needs the ${secret.label}, which call4me never stores, so it can't be scheduled. Place it with call4me_place_call when it's time.`, 422);
      }
      const pending = await db.prepare(`SELECT COUNT(*) AS n FROM scheduled_calls WHERE account_id = ? AND status = 'pending'`).bind(account.id).first<{ n: number }>();
      if ((pending?.n ?? 0) >= SCHEDULE_LIMITS.maxPending) throw new CallError(`${SCHEDULE_LIMITS.maxPending} calls are already scheduled; cancel one with call4me_cancel_scheduled_call first`, 429);

      const id = `sched_${newId()}`;
      await db
        .prepare(`INSERT INTO scheduled_calls (id, account_id, call_at, to_number, business, goal, input, surface, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .bind(id, account.id, when, to.e164, input.business.trim(), input.goal.trim(), JSON.stringify(input), surface, at)
        .run();
      return (await this.forAccount(account.id, id))!;
    },

    async forAccount(accountId: string, id: string): Promise<ScheduledRow> {
      const row = await db.prepare(`SELECT * FROM scheduled_calls WHERE id = ? AND account_id = ?`).bind(id, accountId).first<ScheduledRow>();
      if (!row) throw new CallError('no such scheduled call', 404);
      return row;
    },

    /** Calls still waiting to dial, soonest first. */
    async upcoming(accountId: string): Promise<ScheduledRow[]> {
      const { results } = await db.prepare(`SELECT * FROM scheduled_calls WHERE account_id = ? AND status = 'pending' ORDER BY call_at`).bind(accountId).all<ScheduledRow>();
      return results;
    },

    async cancel(accountId: string, id: string): Promise<ScheduledRow> {
      const row = await this.forAccount(accountId, id);
      if (row.status !== 'pending') throw new CallError(`${id} is ${row.status}, not waiting to dial${row.call_id ? `; to end the call, call4me_hang_up ${row.call_id}` : ''}`);
      await db.prepare(`UPDATE scheduled_calls SET status = 'canceled' WHERE id = ? AND status = 'pending'`).bind(id).run();
      return this.forAccount(accountId, id);
    },
  };
}

/**
 * Dial every scheduled call that has come due. Each is claimed (pending to dialing) before it
 * dials, so two overlapping cron runs never place it twice.
 */
export async function placeDueCalls(env: Env, at = now()): Promise<{ placed: number; failed: number; missed: number }> {
  const db = env.DB;
  const origin = `https://${env.CANONICAL_HOST}`;
  await db
    .prepare(`UPDATE scheduled_calls SET status = 'failed', error = ? WHERE status = 'dialing' AND call_at < ?`)
    .bind('the run dialing it ended before it recorded the call; call4me_list_calls shows whether it went out', at - SCHEDULE_LIMITS.staleDialingMs)
    .run();
  const missed = await db
    .prepare(`UPDATE scheduled_calls SET status = 'failed', error = ? WHERE status = 'pending' AND call_at < ?`)
    .bind(`call4me could not dial it within ${SCHEDULE_LIMITS.missedAfterMs / 60_000} minutes of its time, so it did not dial it late; schedule it again`, at - SCHEDULE_LIMITS.missedAfterMs)
    .run();
  const { results } = await db.prepare(`SELECT * FROM scheduled_calls WHERE status = 'pending' AND call_at <= ? ORDER BY call_at LIMIT 50`).bind(at).all<ScheduledRow>();
  const outcomes = await Promise.all(results.map((row) => dialScheduled(env, origin, row)));
  return { placed: outcomes.filter((o) => o === 'placed').length, failed: outcomes.filter((o) => o === 'failed').length, missed: missed.meta.changes ?? 0 };
}

async function dialScheduled(env: Env, origin: string, row: ScheduledRow): Promise<'placed' | 'failed' | 'skipped'> {
  const db = env.DB;
  const claim = await db.prepare(`UPDATE scheduled_calls SET status = 'dialing' WHERE id = ? AND status = 'pending'`).bind(row.id).run();
  if (!claim.meta.changes) return 'skipped';
  const settle = (status: ScheduledStatus, callId: string | null, error: string | null) =>
    db.prepare(`UPDATE scheduled_calls SET status = ?, call_id = ?, error = ? WHERE id = ?`).bind(status, callId, error, row.id).run();
  try {
    const account = await accounts(db).byId(row.account_id);
    if (!account) throw new CallError('the account no longer exists');
    const call = await placeCall(env, origin, account, JSON.parse(row.input) as ScheduledInput, row.surface, { unattended: true });
    await settle('placed', call.id, null);
    return 'placed';
  } catch (err) {
    if (!(err instanceof CallError)) console.error('scheduled call failed', row.id, err);
    // A refusal after the call row exists (the carrier, a voice deploy) links it, so get_call shows it.
    await settle('failed', err instanceof CallError ? err.callId : null, err instanceof CallError ? err.message : 'something broke on the server placing it');
    return 'failed';
  }
}
