import { newId, now } from '../lib/ids';
import { replayOf, type Idempotency } from '../lib/idempotency';
import { checkDialable, type PhoneCheck } from '../lib/phone';
import { accounts, type Account } from './accounts';
import { catalog, missingMessage, normalizeAccent, normalizeName, PROFILE_FIELDS, resolveIntake, savedContext, type Surface } from './intake';
import { mayCall, ringablePhone } from './numbers';
import { profiles } from './profiles';

type Dialable = Extract<PhoneCheck, { ok: true }>;

import { callStore, CallError, LIMITS, type Brief, type CallRow } from './call-store';

export * from './call-store';

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
  /** The first name the caller introduces itself with. */
  caller_name?: string;
  /** An accent or dialect the caller speaks with ("Austrian German"). */
  accent?: string;
  /** The company the caller calls from: "Jordan from Acme" rather than "Alex's assistant". */
  calling_as?: string;
  /** Where callbacks go instead of the number the call comes from, e.g. the user's mobile. */
  callback_number?: string;
}

/** What a per-call secret looks like wherever the call is stored. */
export const SECRET_MASK = '(given for this call only; not stored)';

/** A call recorded and ready to dial, with its per-call secrets (account PINs), which are never stored. */
interface CreatedCall {
  call: CallRow;
  secrets: { label: string; value: string }[];
  to: Dialable;
  ownerPhone: string | null;
}

export function calls(db: D1Database) {
  return {
    ...callStore(db),
    /**
     * Everything placing this call would refuse, short of money: the category's intake, who it is
     * for, the numbers, and the caller's name. Scheduling a call checks it now, and placing it
     * checks it again when it dials.
     */
    async validate(account: Account, input: PlaceCallInput, surface: Surface = 'agents', tool = 'call4me_place_call') {
      const { bySlug, slugs, profileKeys } = catalog(surface);
      const category = bySlug(input.category);
      if (!category) throw new CallError(`category must be one of: ${slugs.join(', ')}`);
      const profile = await profiles(db).get(account.id);
      // The saved profile is the account owner's. A call for someone else (a friend's appointment)
      // must never borrow the owner's address, insurance or date of birth to fill that person's gaps.
      const forSomeoneElse = isSomeoneElse(input.on_behalf_of, profile.full_name);
      const intake = resolveIntake(category, input.details ?? {}, forSomeoneElse ? {} : profile);
      if (intake.missing.length || intake.invalid.length) throw new CallError(missingMessage(category, intake, forSomeoneElse ? input.on_behalf_of!.trim() : null, tool), 422);
      if (!forSomeoneElse) intake.known.push(...savedContext(profile, profileKeys, intake));
      const onBehalfOf = input.on_behalf_of?.trim() || profile.full_name || account.display_name;
      if (!onBehalfOf) throw new CallError('on_behalf_of: who is this call for? Pass their name, or save full_name with call4me_save_profile.', 422);

      const to = checkDialable(input.to);
      if (!to.ok) throw new CallError(to.reason);
      // Abroad, an account calls only FROM_HOME countries and those it holds a number in (services/numbers.ts).
      if (!(await mayCall(db, account.id, to))) {
        throw new CallError(`calling ${to.country} numbers needs a number in ${to.country}: ${surface === 'agents' ? 'see call4me_list_numbers, then buy one with call4me_buy_number' : 'this account has none (call4me_get_balance lists its numbers)'}`, 422);
      }
      if (input.from) {
        const from = checkDialable(input.from);
        const ours = from.ok && (await db.prepare(`SELECT 1 FROM numbers WHERE account_id = ? AND phone_number = ? AND status = 'active'`).bind(account.id, from.e164).first());
        // Or the user's own number, verified on this account.
        const own = from.ok && !ours ? await db.prepare(`SELECT 1 FROM verified_numbers WHERE account_id = ? AND phone_number = ? AND status = 'verified'`).bind(account.id, from.e164).first() : null;
        if (!ours && !own) throw new CallError(`from: ${input.from} is not one of this account's numbers (see call4me_list_numbers)`);
      }
      const callerName = input.caller_name ? normalizeName(input.caller_name) || null : null;
      const nameProblem = callerName && PROFILE_FIELDS.assistant_name.check?.(callerName);
      if (nameProblem) throw new CallError(`caller_name: ${nameProblem}`);
      const accent = input.accent ? normalizeAccent(input.accent) || null : null;
      const accentProblem = accent && PROFILE_FIELDS.accent.check?.(accent);
      if (accentProblem) throw new CallError(`accent: ${accentProblem}`);
      const callingAs = input.calling_as?.trim() || null;
      let callbackNumber: string | null = null;
      if (input.callback_number?.trim()) {
        const cb = checkDialable(input.callback_number);
        if (!cb.ok) throw new CallError(`callback_number: ${cb.reason}`);
        callbackNumber = cb.e164;
      }
      if (input.timezone && !validTimeZone(input.timezone)) throw new CallError(`timezone: "${input.timezone}" is not an IANA time zone like America/New_York`);

      const blocked = await db.prepare(`SELECT reason FROM blocked_numbers WHERE number = ?`).bind(to.e164).first<{ reason: string }>();
      if (blocked) throw new CallError('this number asked not to be called by call4me', 403);

      // connect_when and listen_in ring the account owner: the phone they gave for this call (when
      // it's their own call), else the one saved in their profile. Refuse now when there's none we
      // can ring, rather than reach the connect after a long hold and have nobody to patch in.
      const ownerPhone = await ringablePhone(db, account.id, (!forSomeoneElse && input.details?.phone?.trim()) || profile.phone);
      if ((input.connect_when?.trim() || input.listen_in) && !ownerPhone) {
        const option = input.listen_in ? 'listen_in' : 'connect_when';
        throw new CallError(
          `${option} rings the user's own phone, and there's no phone number for them we can ring. Ask the user for the number to ring them on and pass it as details.phone (or save it with call4me_save_profile if they want it reused). Place the call without ${option} only if the user says they won't join: businesses often make changes only with the account holder on the line, and with no phone the caller can't bring them on.`,
          422,
        );
      }
      return { category, intake, onBehalfOf, to, callerName, accent, callingAs, callbackNumber, ownerPhone };
    },

    /** Validate, check money and limits, and record the call as queued. Dialing is the caller's next step. */
    /**
     * Returns the call plus its per-call secrets (account PINs): those reach the caller's
     * instructions but are never written to the database. With an Idempotency-Key the request
     * already made a call for, it throws IdempotentReplay with that call before checking anything:
     * a retry must get its call back even after the first one spent the balance.
     */
    async create(account: Account, input: PlaceCallInput, pricePerMinuteCents: number, surface: Surface = 'agents', idempotency?: Idempotency): Promise<CreatedCall> {
      const replay = async () => idempotency && replayOf(await this.byIdempotencyKey(account.id, idempotency.key), idempotency);
      const earlier = await replay();
      if (earlier) throw earlier;
      try {
        return await this.record(account, input, pricePerMinuteCents, surface, idempotency);
      } catch (err) {
        // A concurrent request with the same key won meanwhile: the idempotency index refused this
        // row, or the winner's hold left the balance short. Answer as that request.
        const winner = await replay();
        if (winner) throw winner;
        throw err;
      }
    },

    /** create's work once the Idempotency-Key (if any) is known to be new. */
    async record(account: Account, input: PlaceCallInput, pricePerMinuteCents: number, surface: Surface, idempotency: Idempotency | undefined): Promise<CreatedCall> {
      const { category, intake, onBehalfOf, to, callerName, accent, callingAs, callbackNumber, ownerPhone } = await this.validate(account, input, surface);

      // Credits up front: the call holds its maximum cost now and settles when it ends.
      const balance = await accounts(db).balanceCents(account.id);
      if (balance < pricePerMinuteCents) {
        // Calls in progress hold their maximum cost until they end: say so, or a third parallel call
        // reads "$0.00" while two live calls hold the account's last $4 (wjbono's ChatGPT).
        const live = await db
          .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(hold_cents), 0) AS cents FROM calls WHERE account_id = ? AND status IN ('queued','dialing','in_progress') AND hold_cents > 0`)
          .bind(account.id)
          .first<{ n: number; cents: number }>();
        const held = live?.n ? `, with $${(live.cents / 100).toFixed(2)} held for ${live.n} call${live.n === 1 ? '' : 's'} in progress until ${live.n === 1 ? 'it ends' : 'they end'}; wait for ${live.n === 1 ? 'it' : 'them'} to finish, or ` : '; '
        throw new CallError(`balance is $${(balance / 100).toFixed(2)}${held}${surface === 'agents' ? 'add credits with call4me_add_funds' : 'the user can add credits on the call4me website'}`, 402);
      }
      const affordable = Math.floor(balance / pricePerMinuteCents);
      const maxMinutes = Math.max(1, Math.min(input.max_minutes ?? LIMITS.defaultMinutes, LIMITS.maxMinutes, affordable));
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
        ...(callerName ? { caller_name: callerName } : {}),
        ...(accent ? { accent } : {}),
        ...(callingAs ? { calling_as: callingAs } : {}),
        ...(callbackNumber ? { callback_number: callbackNumber } : {}),
      };
      const id = `call_${newId()}`;
      // The hold and the row commit together: the row is written only if the hold was, and a row the
      // idempotency index refuses (a concurrent request with the same key won) takes its hold back with it.
      const [hold] = await db.batch([
        accounts(db).spendStatement(account.id, holdCents, 'hold', `hold:${id}`, `up to ${maxMinutes} min to ${input.business.trim()}`),
        db
          .prepare(
            `INSERT INTO calls (id, account_id, to_number, business, goal, brief, category, status, hold_cents, idempotency_key, idempotency_hash, created_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ledger WHERE ref = ?)`,
          )
          .bind(id, account.id, to.e164, input.business.trim(), input.goal.trim(), JSON.stringify(brief), category.slug, holdCents, idempotency?.key ?? null, idempotency?.fingerprint ?? null, now(), `hold:${id}`),
      ]);
      if (!hold.meta.changes) throw new CallError('another call is holding those credits; wait for it to finish, add credits, or pass a smaller max_minutes', 402);
      const secrets = intake.known.filter((k) => k.sensitive).map((k) => ({ label: k.label, value: k.value }));
      return { call: (await this.byId(id))!, secrets, to, ownerPhone };
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

/**
 * "Thursday, November 12, 2026" in UTC: the date the caller is given when the business's time zone
 * is unknown. With no date at all the voice model guesses, and once turned an October 7-15 rental
 * into "last July" on November 12.
 */
export function todayUtc(at = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(at);
}

/** "Saturday, September 26, 2026, 3:04 PM" in the business's zone. */
export function localTimeIn(tz: string | null, at = new Date()): string | null {
  if (!tz) return null;
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at);
}
