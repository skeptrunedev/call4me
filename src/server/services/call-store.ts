/**
 * The calls table and its ledger: the rows, their billing and the per-call questions. The voice
 * Worker uses only this, so placing calls (intake, numbers, the drip) stays out of its bundle and a
 * change there does not redeploy it, which locks out new calls for a few minutes each time.
 */
import { newId, now } from '../lib/ids';
import { accounts } from './accounts';

export type CallStatus = 'queued' | 'dialing' | 'in_progress' | 'completed' | 'no_answer' | 'busy' | 'failed' | 'canceled';
export const ACTIVE: CallStatus[] = ['queued', 'dialing', 'in_progress'];
/**
 * An audio drop this close to the end is the hangup itself (the stream can close a moment before
 * Telnyx reports it), not a call that went silent: it bills as usual.
 */
const AUDIO_LOSS_GRACE_MS = 5_000;

export interface Brief {
  category?: string;
  on_behalf_of: string;
  facts: string;
  flexibility: string;
  timezone: string | null;
  max_minutes: number;
  /** When to patch the user in without being asked. */
  connect_when?: string | null;
  /** Ring the user to listen in as soon as the business answers. */
  listen_in?: boolean;
  /** The first name the caller goes by ("Jordan"); none by default. */
  caller_name?: string | null;
  /** The accent or dialect the caller holds ("Austrian German"); its voice's own by default. */
  accent?: string | null;
  /** The company the caller calls as ("Acme"); callbacks to the number it called from answer the same way. */
  calling_as?: string | null;
  /** The number the business is given to call back, when the user named one; else the number the call came from. */
  callback_number?: string | null;
}

export interface TranscriptLine {
  /** 'note' marks what happened on the line rather than what was said (the person joining or leaving). */
  role: 'caller' | 'them' | 'note';
  text: string;
  at: number;
}

export interface Outcome {
  result: 'done' | 'partial' | 'not_possible' | 'voicemail' | 'call_back_later';
  summary: string;
  details?: Record<string, unknown>;
}

export interface CallRow {
  id: string;
  account_id: string;
  direction: 'outbound' | 'inbound';
  to_number: string;
  from_number: string | null;
  /** Set when from_number is the user's own verified number: the call4me number that rings them to join. */
  ring_number: string | null;
  business: string;
  goal: string;
  brief: string;
  status: CallStatus;
  telnyx_call_control_id: string | null;
  answered_at: number | null;
  ended_at: number | null;
  billed_seconds: number | null;
  cost_cents: number | null;
  /** Seconds on hold already over (billed at half price), and when a hold still going started. */
  hold_seconds: number;
  hold_since: number | null;
  /** When the call's audio first reached the voice session; null if Telnyx never connected it. */
  audio_at: number | null;
  /** When its audio stream dropped, while it has not come back; null once audio flows again. */
  audio_lost_at: number | null;
  hold_cents: number | null;
  outcome: string | null;
  transcript: string | null;
  hangup_cause: string | null;
  /** The far end's SIP response at hangup: on an unanswered call, '486' busy, '603' declined, '604' no such number... */
  sip_hangup_cause: string | null;
  /** Telnyx's hangup_source: 'caller' (our side, on an outbound call), 'callee', or 'unknown'. */
  hangup_source: string | null;
  /** Set when call4me itself hung up: why (the task was done, the user asked, the time limit...). */
  end_reason: string | null;
  error: string | null;
  /** Inbound only: the outbound call whose unfinished task this callback picked up. */
  callback_for: string | null;
  /** The Idempotency-Key the request placing it sent, and its body's fingerprint (lib/idempotency.ts). */
  idempotency_key: string | null;
  idempotency_hash: string | null;
  created_at: number;
}

/** Results that leave a task open: a callback to the account's number can still finish it. */
export const OPEN_RESULTS: Outcome['result'][] = ['voicemail', 'call_back_later', 'partial'];
/** How long an unfinished task waits for a callback. */
export const CALLBACK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The unfinished tasks an incoming call may be about, newest first, one per business number
 * (three voicemails to one office are one task). The caller's own number goes first.
 */
export function openTasks<T extends Pick<CallRow, 'to_number' | 'created_at'>>(rows: T[], from: string): T[] {
  const seen = new Set<string>();
  const unique = [...rows].sort((a, b) => b.created_at - a.created_at).filter((r) => !seen.has(r.to_number) && seen.add(r.to_number));
  return [...unique.filter((r) => r.to_number === from), ...unique.filter((r) => r.to_number !== from)];
}

/** The task a callback is about when it's clear up front: the caller's number matches, or only one is open. */
export function likelyTask<T extends Pick<CallRow, 'to_number'>>(tasks: T[], from: string): T | null {
  return tasks.find((t) => t.to_number === from) ?? (tasks.length === 1 ? tasks[0] : null);
}

export interface Question {
  id: string;
  question: string;
  answer: string | null;
  asked_at: number;
  answered_at: number | null;
}

export class CallError extends Error {
  constructor(
    message: string,
    public status = 400,
    /** The call row this refusal left behind (failed), when it got that far. */
    public callId: string | null = null,
  ) {
    super(message);
  }
}

/**
 * Calls default to 30 minutes; an explicit cap can reach Telnyx's 4 hour ceiling. A call still on
 * hold when its cap comes up holds `holdExtensionMinutes` more credits and keeps waiting, and one
 * still mid-conversation holds `talkExtensionMinutes` more to finish it, as long as the balance
 * covers it, up to that ceiling.
 */
export const LIMITS = {
  defaultMinutes: 30,
  maxMinutes: 240,
  holdExtensionMinutes: 15,
  talkExtensionMinutes: 2,
};

/** Mask each secret's literal value in a line of transcript (speech-to-text may still spell it differently). */
export function redact(text: string, secrets: string[]): string {
  return secrets.reduce((t, s) => (s.length >= 3 ? t.split(s).join('••••') : t), text);
}

/**
 * What a call costs: every started minute at the call's price, except whole minutes spent on hold,
 * which are half price. `holdSeconds` beyond the call's length are ignored.
 */
function billedCents(talkSeconds: number, pricePerMinuteCents: number, holdSeconds = 0): number {
  const minutes = Math.ceil(talkSeconds / 60);
  const holdMinutes = Math.min(minutes, Math.floor(Math.min(holdSeconds, talkSeconds) / 60));
  return (minutes - holdMinutes) * pricePerMinuteCents + Math.ceil((holdMinutes * pricePerMinuteCents) / 2);
}

/** Seconds on hold by `at`: the holds already over plus one still going. */
const holdSecondsAt = (row: Pick<CallRow, 'hold_seconds' | 'hold_since'>, at: number) =>
  (row.hold_seconds ?? 0) + (row.hold_since ? Math.max(0, Math.round((at - row.hold_since) / 1000)) : 0);

type Metered = Pick<CallRow, 'answered_at' | 'hold_seconds' | 'hold_since'>;

/**
 * What a call has cost by `at`: its answered time, with hold minutes at half price. Time the user
 * spends on the call themselves counts like the rest: the caller keeps working while they're on.
 */
function costAt(row: Metered, at: number, pricePerMinuteCents: number): { cents: number; seconds: number; holdSeconds: number } {
  const seconds = row.answered_at ? Math.max(0, Math.round((at - row.answered_at) / 1000)) : 0;
  const holdSeconds = Math.min(holdSecondsAt(row, at), seconds);
  return { cents: seconds > 0 ? billedCents(seconds, pricePerMinuteCents, holdSeconds) : 0, seconds, holdSeconds };
}

/**
 * Credits held for a call that its time up to `at` hasn't used. They are held at full price, so a
 * call that spent its time on hold has about half its credits left when its limit comes up.
 */
function unusedHoldCents(row: Pick<CallRow, 'hold_cents'> & Metered, at: number, pricePerMinuteCents: number): number {
  if (!row.hold_cents || !row.answered_at) return 0;
  return Math.max(0, row.hold_cents - costAt(row, at, pricePerMinuteCents).cents);
}

export function callStore(db: D1Database) {
  return {
    byId(id: string): Promise<CallRow | null> {
      return db.prepare(`SELECT * FROM calls WHERE id = ?`).bind(id).first<CallRow>();
    },

    byIdempotencyKey(accountId: string, key: string): Promise<CallRow | null> {
      return db.prepare(`SELECT * FROM calls WHERE account_id = ? AND idempotency_key = ?`).bind(accountId, key).first<CallRow>();
    },

    /** The carrier never took the call: free its Idempotency-Key, so a retry with it places the call. */
    async releaseIdempotencyKey(id: string): Promise<void> {
      await db.prepare(`UPDATE calls SET idempotency_key = NULL, idempotency_hash = NULL WHERE id = ?`).bind(id).run();
    },

    async forAccount(accountId: string, id: string): Promise<CallRow> {
      const row = await db.prepare(`SELECT * FROM calls WHERE id = ? AND account_id = ?`).bind(id, accountId).first<CallRow>();
      if (!row) throw new CallError('no such call', 404);
      return row;
    },

    byControlId(controlId: string): Promise<CallRow | null> {
      return db.prepare(`SELECT * FROM calls WHERE telnyx_call_control_id = ?`).bind(controlId).first<CallRow>();
    },

    /** Outbound calls whose task is still open (see OPEN_RESULTS) and that nothing later finished. */
    async unfinished(accountId: string, at = now()): Promise<CallRow[]> {
      const { results } = await db
        .prepare(
          `SELECT c.* FROM calls c
           WHERE c.account_id = ?1 AND c.direction = 'outbound' AND c.created_at > ?2
             AND json_extract(c.outcome, '$.result') IN (${OPEN_RESULTS.map((r) => `'${r}'`).join(', ')})
             AND NOT EXISTS (
               SELECT 1 FROM calls d
               WHERE d.account_id = c.account_id AND d.created_at > c.created_at
                 AND json_extract(d.outcome, '$.result') = 'done'
                 AND (d.callback_for = c.id OR (d.direction = 'outbound' AND d.to_number = c.to_number)))
           ORDER BY c.created_at DESC LIMIT 20`,
        )
        .bind(accountId, at - CALLBACK_WINDOW_MS)
        .all<CallRow>();
      return results;
    },

    /** Callbacks that picked up this call's task. */
    async callbacksFor(id: string): Promise<CallRow[]> {
      const { results } = await db.prepare(`SELECT * FROM calls WHERE callback_for = ? ORDER BY created_at`).bind(id).all<CallRow>();
      return results;
    },

    async list(accountId: string, limit = 20): Promise<CallRow[]> {
      const { results } = await db.prepare(`SELECT * FROM calls WHERE account_id = ? ORDER BY created_at DESC LIMIT ?`).bind(accountId, limit).all<CallRow>();
      return results;
    },

    async dialing(id: string, controlId: string): Promise<void> {
      await db.prepare(`UPDATE calls SET status = 'dialing', telnyx_call_control_id = ? WHERE id = ? AND status = 'queued'`).bind(controlId, id).run();
    },

    async answered(id: string, at = now()): Promise<void> {
      await db.prepare(`UPDATE calls SET status = 'in_progress', answered_at = COALESCE(answered_at, ?) WHERE id = ? AND status IN ('queued','dialing')`).bind(at, id).run();
    },

    /** call4me is about to hang up its side: record why, unless an earlier reason already won. */
    async hangingUp(id: string, reason: string): Promise<void> {
      await db.prepare(`UPDATE calls SET end_reason = COALESCE(end_reason, ?) WHERE id = ?`).bind(reason, id).run();
    },

    async saveTranscript(id: string, lines: TranscriptLine[]): Promise<void> {
      await db.prepare(`UPDATE calls SET transcript = ? WHERE id = ?`).bind(JSON.stringify(lines), id).run();
    },

    async saveOutcome(id: string, outcome: Outcome): Promise<void> {
      await db.prepare(`UPDATE calls SET outcome = ? WHERE id = ?`).bind(JSON.stringify(outcome), id).run();
    },

    /**
     * Terminal state plus billing, exactly once: the status guard makes a second hangup
     * event a no-op, and the ledger ref is the call id.
     */
    async finish(id: string, opts: { status: CallStatus; hangupCause?: string | null; sipHangupCause?: string | null; hangupSource?: string | null; error?: string | null; pricePerMinuteCents: number; at?: number }): Promise<CallRow | null> {
      const endedAt = opts.at ?? now();
      const row = await this.byId(id);
      if (!row || !ACTIVE.includes(row.status)) return row;
      const talkSeconds = row.answered_at ? Math.max(0, Math.round((endedAt - row.answered_at) / 1000)) : 0;
      // Answered, but its audio never reached us: Telnyx couldn't connect the media stream, so the
      // business heard silence until it hung up. That's our failure, not a call that ran.
      const noAudio = opts.status === 'completed' && !!row.answered_at && !row.audio_at;
      // Its audio dropped partway and never came back: the business heard silence until it hung up,
      // or we did. A drop just before a normal hangup is the hangup itself, so it still bills.
      const lostAudio = opts.status === 'completed' && !!row.answered_at && !!row.audio_lost_at && endedAt - row.audio_lost_at >= AUDIO_LOSS_GRACE_MS;
      const status: CallStatus = opts.status === 'completed' && !row.answered_at ? 'no_answer' : noAudio || lostAudio ? 'failed' : opts.status;
      const error = opts.error ?? (noAudio ? 'the call audio never connected' : lostAudio ? 'lost the call audio and could not reconnect it' : null);
      // Only calls that connected and ran normally are billed; our own failures are free. A call
      // never costs more than the credits held for it, even if it ran past its limit.
      const metered = costAt(row, endedAt, opts.pricePerMinuteCents);
      const billed = status === 'completed' && talkSeconds > 0 ? metered.cents : 0;
      const cost = row.hold_cents ? Math.min(billed, row.hold_cents) : billed;
      const r = await db
        .prepare(
          // A hold still open at hangup is billed above; it is closed here too, so the row's totals
          // match the bill (Cody's 37 minutes on hold read as 0 on the account page).
          `UPDATE calls SET status = ?, ended_at = ?, billed_seconds = ?, cost_cents = ?, hangup_cause = COALESCE(?, hangup_cause), sip_hangup_cause = COALESCE(?, sip_hangup_cause), hangup_source = COALESCE(?, hangup_source), error = COALESCE(?, error),
             hold_seconds = ?, hold_since = NULL
           WHERE id = ? AND status IN ('queued','dialing','in_progress')`,
        )
        .bind(status, endedAt, talkSeconds, cost, opts.hangupCause ?? null, opts.sipHangupCause ?? null, opts.hangupSource ?? null, error, holdSecondsAt(row, endedAt), id)
        .run();
      if ((r.meta.changes ?? 0) > 0) {
        const ledger = accounts(db);
        if (row.hold_cents) await ledger.post(row.account_id, row.hold_cents, 'release', `release:${id}`, 'hold released');
        const holdMinutes = Math.floor(metered.holdSeconds / 60);
        if (cost > 0)
          await ledger.post(
            row.account_id,
            -cost,
            'call',
            `call:${id}`,
            `${Math.ceil(talkSeconds / 60)} min to ${row.business}${holdMinutes ? `, ${holdMinutes} on hold at half price` : ''}`,
          );
      }
      return this.byId(id);
    },

    /** The call's audio first reached the voice session at `at`. */
    /** Audio reached the voice session: the first time, or again after a drop (audioLost). */
    async audioArrived(id: string, at: number): Promise<void> {
      await db.prepare(`UPDATE calls SET audio_at = COALESCE(audio_at, ?), audio_lost_at = NULL WHERE id = ?`).bind(at, id).run();
    },

    /** The call's audio stream dropped; kept from the first drop until audio flows again. */
    async audioLost(id: string, at: number): Promise<void> {
      await db.prepare(`UPDATE calls SET audio_lost_at = ? WHERE id = ? AND audio_lost_at IS NULL`).bind(at, id).run();
    },

    /** The business put the call on hold at `at`. */
    async holdStarted(id: string, at: number): Promise<void> {
      await db.prepare(`UPDATE calls SET hold_since = ? WHERE id = ? AND hold_since IS NULL`).bind(at, id).run();
    },

    /** The hold that started at hold_since ended at `at`. */
    async holdEnded(id: string, at: number): Promise<void> {
      await db
        .prepare(`UPDATE calls SET hold_seconds = hold_seconds + MAX(0, CAST(ROUND((? - hold_since) / 1000.0) AS INTEGER)), hold_since = NULL WHERE id = ? AND hold_since IS NOT NULL`)
        .bind(at, id)
        .run();
    },

    /**
     * Up to `want` more minutes for a call still running at `at`, the n-th time it has been
     * extended. Credits already held that its time so far hasn't used (hold minutes bill at half
     * price) pay for them first; only the rest is held from the balance. Returns the minutes
     * granted, 0 when the balance can't cover one.
     */
    async extend(row: Pick<CallRow, 'id' | 'account_id' | 'business' | 'hold_cents'> & Metered, want: number, pricePerMinuteCents: number, n: number, at: number): Promise<number> {
      const unused = unusedHoldCents(row, at, pricePerMinuteCents);
      const balance = await accounts(db).balanceCents(row.account_id);
      const minutes = Math.min(want, Math.floor((balance + unused) / pricePerMinuteCents));
      if (minutes < 1) return 0;
      const cents = Math.max(0, minutes * pricePerMinuteCents - unused);
      if (!cents) return minutes;
      if (!(await accounts(db).hold(row.account_id, cents, `hold:${row.id}:${n}`, `${minutes} more min on hold with ${row.business}`))) return 0;
      await db.prepare(`UPDATE calls SET hold_cents = COALESCE(hold_cents, 0) + ? WHERE id = ?`).bind(cents, row.id).run();
      return minutes;
    },

    async block(number: string, reason: string): Promise<void> {
      await db.prepare(`INSERT OR IGNORE INTO blocked_numbers (number, reason, created_at) VALUES (?, ?, ?)`).bind(number, reason, now()).run();
    },

    // ---- mid-call questions

    async ask(callId: string, question: string): Promise<string> {
      const id = `q_${newId(12)}`;
      await db.prepare(`INSERT INTO call_questions (id, call_id, question, asked_at) VALUES (?, ?, ?, ?)`).bind(id, callId, question, now()).run();
      return id;
    },

    async questions(callId: string): Promise<Question[]> {
      const { results } = await db.prepare(`SELECT id, question, answer, asked_at, answered_at FROM call_questions WHERE call_id = ? ORDER BY asked_at`).bind(callId).all<Question>();
      return results;
    },

    async answer(accountId: string, callId: string, questionId: string, answer: string): Promise<Question> {
      const call = await this.forAccount(accountId, callId);
      if (!ACTIVE.includes(call.status)) throw new CallError('the call has already ended');
      const r = await db.prepare(`UPDATE call_questions SET answer = ?, answered_at = ? WHERE id = ? AND call_id = ? AND answer IS NULL`).bind(answer, now(), questionId, callId).run();
      if ((r.meta.changes ?? 0) === 0) throw new CallError('no open question with that id on this call', 404);
      return (await db.prepare(`SELECT id, question, answer, asked_at, answered_at FROM call_questions WHERE id = ?`).bind(questionId).first<Question>())!;
    },
  };
}
