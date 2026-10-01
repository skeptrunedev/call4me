import { newId, now } from '../lib/ids';
import { checkDialable, type PhoneCheck } from '../lib/phone';
import { accounts, type Account } from './accounts';
import { catalog, missingMessage, resolveIntake, type Surface } from './intake';
import { mayCall } from './numbers';
import { profiles } from './profiles';

type Dialable = Extract<PhoneCheck, { ok: true }>;

export type CallStatus = 'queued' | 'dialing' | 'in_progress' | 'completed' | 'no_answer' | 'busy' | 'failed' | 'canceled';
export const ACTIVE: CallStatus[] = ['queued', 'dialing', 'in_progress'];

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
  business: string;
  goal: string;
  brief: string;
  status: CallStatus;
  telnyx_call_control_id: string | null;
  answered_at: number | null;
  ended_at: number | null;
  billed_seconds: number | null;
  cost_cents: number | null;
  hold_cents: number | null;
  outcome: string | null;
  transcript: string | null;
  hangup_cause: string | null;
  error: string | null;
  /** Inbound only: the outbound call whose unfinished task this callback picked up. */
  callback_for: string | null;
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
  ) {
    super(message);
  }
}

/** Limits that keep one account from turning call4me into a robocaller. */
export const LIMITS = {
  concurrentPerAccount: 2,
  defaultMaxMinutes: 10,
  maxMinutes: 30,
};

export interface PlaceCallInput {
  to: string;
  business: string;
  goal: string;
  /** Which intake applies (see intake.ts); it decides what must be known before dialing. */
  category: string;
  /** Per-call answers to the category's fields, by field key. Profile fields fill the rest. */
  details?: Record<string, string>;
  on_behalf_of?: string;
  /** Anything else the caller may share, beyond the category's fields. */
  facts?: string;
  flexibility?: string;
  timezone?: string;
  max_minutes?: number;
  /** When to patch the user in without being asked, e.g. "as soon as a person picks up". */
  connect_when?: string;
  /** Ring the user as soon as the business answers so they can listen in (press 1 to take over). */
  listen_in?: boolean;
  /** Which of the account's numbers to call from; by default one in the callee's country. */
  from?: string;
}

/** What a per-call secret looks like wherever the call is stored. */
export const SECRET_MASK = '(given for this call only; not stored)';

/** Mask each secret's literal value in a line of transcript (speech-to-text may still spell it differently). */
export function redact(text: string, secrets: string[]): string {
  return secrets.reduce((t, s) => (s.length >= 3 ? t.split(s).join('••••') : t), text);
}

export const billedCents = (talkSeconds: number, pricePerMinuteCents: number) => Math.ceil(talkSeconds / 60) * pricePerMinuteCents;

export function calls(db: D1Database) {
  return {
    /** Validate, check money and limits, and record the call as queued. Dialing is the caller's next step. */
    /**
     * Returns the call plus its per-call secrets (account PINs): those reach the caller's
     * instructions but are never written to the database.
     */
    async create(account: Account, input: PlaceCallInput, pricePerMinuteCents: number, surface: Surface = 'agents'): Promise<{ call: CallRow; secrets: { label: string; value: string }[]; to: Dialable }> {
      const { bySlug, slugs } = catalog(surface);
      const category = bySlug(input.category);
      if (!category) throw new CallError(`category must be one of: ${slugs.join(', ')}`);
      const profile = await profiles(db).get(account.id);
      // The saved profile is the account owner's. A call for someone else (a friend's appointment)
      // must never borrow the owner's address, insurance or date of birth to fill that person's gaps.
      const forSomeoneElse = isSomeoneElse(input.on_behalf_of, profile.full_name);
      const intake = resolveIntake(category, input.details ?? {}, forSomeoneElse ? {} : profile);
      if (intake.missing.length || intake.invalid.length) throw new CallError(missingMessage(category, intake, forSomeoneElse ? input.on_behalf_of!.trim() : null), 422);
      const onBehalfOf = input.on_behalf_of?.trim() || profile.full_name || account.display_name;
      if (!onBehalfOf) throw new CallError('on_behalf_of: who is this call for? Pass their name, or save full_name with call4me_save_profile.', 422);

      const to = checkDialable(input.to);
      if (!to.ok) throw new CallError(to.reason);
      // Abroad, an account calls only countries it holds a number in (services/numbers.ts).
      if (!(await mayCall(db, account.id, to))) {
        throw new CallError(`calling ${to.country} numbers needs a number in ${to.country}: ${surface === 'agents' ? 'see call4me_list_numbers, then buy one with call4me_buy_number' : 'this account has none (see call4me_list_numbers)'}`, 422);
      }
      if (input.from) {
        const from = checkDialable(input.from);
        const owns = from.ok && (await db.prepare(`SELECT 1 FROM numbers WHERE account_id = ? AND phone_number = ? AND status = 'active'`).bind(account.id, from.e164).first());
        if (!owns) throw new CallError(`from: ${input.from} is not one of this account's numbers (see call4me_list_numbers)`);
      }
      if (input.timezone && !validTimeZone(input.timezone)) throw new CallError(`timezone: "${input.timezone}" is not an IANA time zone like America/New_York`);

      const blocked = await db.prepare(`SELECT reason FROM blocked_numbers WHERE number = ?`).bind(to.e164).first<{ reason: string }>();
      if (blocked) throw new CallError('this number asked not to be called by call4me', 403);

      const counts = await db
        .prepare(`SELECT COUNT(*) AS active FROM calls WHERE account_id = ? AND status IN ('queued','dialing','in_progress')`)
        .bind(account.id)
        .first<{ active: number }>();
      if (counts && counts.active >= LIMITS.concurrentPerAccount) throw new CallError(`at most ${LIMITS.concurrentPerAccount} calls at once; wait for one to finish`, 429);

      // Credits up front: the call holds its maximum cost now and settles when it ends.
      const balance = await accounts(db).balanceCents(account.id);
      if (balance < pricePerMinuteCents) throw new CallError(`balance is $${(balance / 100).toFixed(2)}; ${surface === 'agents' ? 'add credits with call4me_add_funds' : 'the user can add credits on the call4me website'}`, 402);
      const affordable = Math.floor(balance / pricePerMinuteCents);
      const maxMinutes = Math.max(1, Math.min(input.max_minutes ?? LIMITS.defaultMaxMinutes, LIMITS.maxMinutes, affordable));
      const holdCents = maxMinutes * pricePerMinuteCents;

      const whenFields = intake.known.filter((k) => k.grants);
      const brief: Brief = {
        category: category.slug,
        on_behalf_of: onBehalfOf,
        facts: [...intake.known.map((k) => `${k.label}: ${k.sensitive ? SECRET_MASK : k.value}`), input.facts?.trim() ?? ''].filter(Boolean).join('\n'),
        flexibility: [...whenFields.map((k) => `${k.label}: ${k.value}`), input.flexibility?.trim() ?? ''].filter(Boolean).join('\n'),
        timezone: input.timezone ?? null,
        max_minutes: maxMinutes,
        connect_when: input.connect_when?.trim() || null,
        ...(input.listen_in ? { listen_in: true } : {}),
      };
      const id = `call_${newId()}`;
      if (!(await accounts(db).hold(account.id, holdCents, `hold:${id}`, `up to ${maxMinutes} min to ${input.business.trim()}`))) {
        throw new CallError('another call is using those credits; wait for it to finish or add credits', 402);
      }
      await db
        .prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, category, status, hold_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`)
        .bind(id, account.id, to.e164, input.business.trim(), input.goal.trim(), JSON.stringify(brief), category.slug, holdCents, now())
        .run();
      const secrets = intake.known.filter((k) => k.sensitive).map((k) => ({ label: k.label, value: k.value }));
      return { call: (await this.byId(id))!, secrets, to };
    },

    byId(id: string): Promise<CallRow | null> {
      return db.prepare(`SELECT * FROM calls WHERE id = ?`).bind(id).first<CallRow>();
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
    async finish(id: string, opts: { status: CallStatus; hangupCause?: string | null; error?: string | null; pricePerMinuteCents: number; at?: number }): Promise<CallRow | null> {
      const endedAt = opts.at ?? now();
      const row = await this.byId(id);
      if (!row || !ACTIVE.includes(row.status)) return row;
      const talkSeconds = row.answered_at ? Math.max(0, Math.round((endedAt - row.answered_at) / 1000)) : 0;
      const status: CallStatus = opts.status === 'completed' && !row.answered_at ? 'no_answer' : opts.status;
      // Only calls that connected and ran normally are billed; our own failures are free.
      const cost = status === 'completed' && talkSeconds > 0 ? billedCents(talkSeconds, opts.pricePerMinuteCents) : 0;
      const r = await db
        .prepare(
          `UPDATE calls SET status = ?, ended_at = ?, billed_seconds = ?, cost_cents = ?, hangup_cause = COALESCE(?, hangup_cause), error = COALESCE(?, error)
           WHERE id = ? AND status IN ('queued','dialing','in_progress')`,
        )
        .bind(status, endedAt, talkSeconds, cost, opts.hangupCause ?? null, opts.error ?? null, id)
        .run();
      if ((r.meta.changes ?? 0) > 0) {
        const ledger = accounts(db);
        if (row.hold_cents) await ledger.post(row.account_id, row.hold_cents, 'release', `release:${id}`, 'hold released');
        if (cost > 0) await ledger.post(row.account_id, -cost, 'call', `call:${id}`, `${Math.ceil(talkSeconds / 60)} min to ${row.business}`);
      }
      return this.byId(id);
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

/** True when a call names someone other than the profile's owner (case and spacing aside). */
export function isSomeoneElse(onBehalfOf: string | undefined, profileName: string | undefined): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  return Boolean(onBehalfOf?.trim() && profileName?.trim() && norm(onBehalfOf) !== norm(profileName));
}

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "Saturday, September 26, 2026, 3:04 PM" in the business's zone. */
export function localTimeIn(tz: string | null, at = new Date()): string | null {
  if (!tz) return null;
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at);
}
