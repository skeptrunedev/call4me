import { newId, now } from '../lib/ids';
import { CODE_ATTEMPTS, VERIFICATIONS_PER_DAY } from '../lib/number-schema';
import { checkDialable, formatPhone, type PhoneCheck } from '../lib/phone';
import { telnyx, TelnyxError, type AvailableNumber, type NumberOrderStatus } from '../lib/telnyx';
import { accounts, dollars, type Account } from './accounts';

/**
 * The phone numbers an account holds. Its first US number is free and bought on its first
 * call. Every other number, in the US or abroad, is paid from credits at exactly what Telnyx
 * charges: the upfront and first month's cost when bought, then the monthly cost every 30
 * days. A number whose renewal the balance can't cover is released after a grace period.
 * Owning a number in a country is what lets an account call businesses there.
 *
 * An account can also call from the user's own phone number once it proves it holds that phone
 * (verified_numbers): the carrier texts or reads out a code, and the code comes back through
 * call4me. Telnyx keeps one verified list for our whole carrier account, so a number is
 * verified for one call4me account at a time, and only ever from a fresh code: a number the
 * carrier already lists as verified is never handed to another account.
 */

/**
 * Where numbers are sold: the number type offered in each country and, where the country's
 * regulator requires paperwork, the Telnyx requirement group holding it. A country with a
 * requirement group sells numbers only once Telnyx has approved that group.
 */
export const COUNTRIES: Record<string, { name: string; type: string; requirementGroup?: string; /** Why sales are on hold, e.g. the carrier's calling rate isn't known yet. */ paused?: string }> = {
  US: { name: 'United States', type: 'local' },
  CA: { name: 'Canada', type: 'local' },
  PR: { name: 'Puerto Rico', type: 'local' },
  GB: { name: 'United Kingdom', type: 'local', requirementGroup: '56b7c2a9-0a26-4a9d-8a9c-4b468f19b8d6' },
  NL: { name: 'Netherlands', type: 'mobile', requirementGroup: 'd218655e-2634-4dcb-82e0-543c02919e63' },
  MX: { name: 'Mexico', type: 'local', requirementGroup: '93bc615f-78c9-4d0f-9db7-95e9f3b70fb4' },
  DK: { name: 'Denmark', type: 'mobile', requirementGroup: '91eb2437-7949-4683-9906-d340e655daee' },
  IS: { name: 'Iceland', type: 'local', requirementGroup: '8d2244f9-dc62-400c-8672-9fae946fc5bd' },
  LT: { name: 'Lithuania', type: 'mobile', requirementGroup: '333570f7-30c9-4302-98c8-353fdb1955af' },
  PL: { name: 'Poland', type: 'local', paused: 'Polish numbers need a street address in Poland, in the number\'s area code region' },
  CY: { name: 'Cyprus', type: 'local', requirementGroup: 'a5999de0-1d23-4a10-a0f4-1667e7ccdc9a' },
  UA: { name: 'Ukraine', type: 'mobile', requirementGroup: '62481732-9314-4305-bdc5-5b374dc56619' },
  IL: { name: 'Israel', type: 'mobile', requirementGroup: '7f2499ea-aaec-4c3d-a143-f8473402d192' },
  ZA: { name: 'South Africa', type: 'mobile', requirementGroup: 'de2c1543-8d21-4a72-b3bd-35a0ca86f0ed' },
  KE: { name: 'Kenya', type: 'mobile', requirementGroup: 'f3b590ec-f01d-4a95-80b3-dc3075d5e19b' },
  GH: { name: 'Ghana', type: 'mobile', requirementGroup: '5550c129-123d-4829-9d4e-a7403bbd97d9' },
  PH: { name: 'Philippines', type: 'local', requirementGroup: 'cf142008-13f8-4b77-b35f-fda0cfcd1b44' },
  CL: { name: 'Chile', type: 'local', requirementGroup: 'f9cfea81-1c62-451f-8c4b-6791db1a6f5b' },
  CO: { name: 'Colombia', type: 'local', requirementGroup: '37f32e5f-e406-44fd-b37c-4760eae74b90' },
  PA: { name: 'Panama', type: 'local', requirementGroup: '90eaa1a5-2536-4b02-9a6a-61aba8036f6c' },
  BO: { name: 'Bolivia', type: 'national', requirementGroup: '5b04967d-b4cd-46d6-9063-f04f9396afcc' },
  NI: { name: 'Nicaragua', type: 'mobile', requirementGroup: 'f59a2236-08ed-4514-a067-216b7d6fa2a4', paused: 'its calling rate is not published yet, so calls there cannot be priced' },
};

const DAY = 24 * 60 * 60 * 1000;
export const RENEWAL_DAYS = 30;
/** How long a number is kept after its renewal failed for lack of credits. */
export const GRACE_DAYS = 7;
/**
 * How long buying a number waits on the carrier before answering "pending": long enough for a US
 * or Canadian order, short enough that an agent's tool call (often cut off near 30 seconds) gets
 * its answer. The free first number, bought while placing a call, can wait as long as before.
 */
const PURCHASE_WAIT_MS = 4500;
const INCLUDED_WAIT_MS = 30_000;
/** A pending purchase with no order at the carrier after this long never reached it, and is refunded. */
const ORDER_LOST_MS = 10 * 60 * 1000;
/** The label a number's order carries at the carrier, so a purchase cut off mid-request can find it. */
const orderReference = (id: string) => `call4me-number:${id}`;

/** A NANP (+1) number: US, Canadian and Puerto Rican numbers call each other's businesses. */
const isHome = (e164: string) => e164.startsWith('+1');

export class NumberError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface NumberRow {
  id: string;
  account_id: string;
  phone_number: string;
  country: string;
  number_type: string;
  included: number;
  monthly_cents: number;
  paid_through: number | null;
  /** pending: paid for and waiting on the carrier's order (order_id); failed: the order was turned down and refunded. */
  status: 'pending' | 'active' | 'released' | 'failed';
  created_at: number;
  released_at: number | null;
  order_id: string | null;
}

export interface NumberView {
  number: string;
  e164: string;
  country: string;
  country_name: string;
  type: string;
  included: boolean;
  monthly: string;
  monthly_cents: number;
  /** When the next monthly charge is due (null for the free number). */
  renews: string | null;
  /** True once a renewal failed; the number is released at `release_after` unless credits are added. */
  overdue: boolean;
  release_after: string | null;
}

/** A bought number: ready to call from, or paid for and waiting on the carrier. */
export type Bought = { number: NumberView; pending?: never } | { pending: PendingNumberView; number?: never };

/** A number paid for and waiting on the carrier: an order abroad goes through regulatory review first. */
export interface PendingNumberView {
  number: string;
  e164: string;
  country: string;
  country_name: string;
  type: string;
  monthly: string;
  monthly_cents: number;
  /** When it was bought. It can't place calls until it activates; the first month starts then. */
  ordered: string;
}

/** The user's own number, verified (or being verified) to call from. */
export interface VerifiedNumberRow {
  id: string;
  account_id: string;
  phone_number: string;
  country: string;
  method: 'sms' | 'call';
  status: 'pending' | 'verified' | 'expired' | 'removed';
  attempts: number;
  created_at: number;
  verified_at: number | null;
  removed_at: number | null;
}

export interface OwnNumberView {
  number: string;
  e164: string;
  country: string;
  country_name: string;
  /** pending: the code was sent and hasn't come back yet. */
  status: 'pending' | 'verified';
  method: 'sms' | 'call';
  verified_at: string | null;
}

export interface CountryOffer {
  country: string;
  name: string;
  type: string;
  /** False while the country's paperwork is under review or no number is for sale. */
  available: boolean;
  reason: string | null;
  upfront_cents: number | null;
  monthly_cents: number | null;
  /** What buying one takes from the balance today: the upfront cost plus the first month. */
  price: string | null;
  monthly: string | null;
}

/** Carrier trouble reaches people as a retryable NumberError, the details only in the logs. */
async function carrier<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof TelnyxError)) throw err;
    console.error('number carrier request failed', err.message);
    throw new NumberError('the phone carrier did not answer; nothing was charged. try again shortly', 502);
  }
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function pendingNumberView(r: NumberRow): PendingNumberView {
  return {
    number: formatPhone(r.phone_number),
    e164: r.phone_number,
    country: r.country,
    country_name: COUNTRIES[r.country]?.name ?? r.country,
    type: r.number_type,
    monthly: dollars(r.monthly_cents),
    monthly_cents: r.monthly_cents,
    ordered: day(r.created_at),
  };
}

export function numberView(r: NumberRow, at = now()): NumberView {
  const overdue = !r.included && r.paid_through !== null && r.paid_through <= at;
  return {
    number: formatPhone(r.phone_number),
    e164: r.phone_number,
    country: r.country,
    country_name: COUNTRIES[r.country]?.name ?? r.country,
    type: r.number_type,
    included: Boolean(r.included),
    monthly: dollars(r.monthly_cents),
    monthly_cents: r.monthly_cents,
    renews: r.included || r.paid_through === null ? null : day(r.paid_through),
    overdue,
    release_after: overdue ? day(r.paid_through! + GRACE_DAYS * DAY) : null,
  };
}

export function ownNumberView(r: VerifiedNumberRow): OwnNumberView {
  return {
    number: formatPhone(r.phone_number),
    e164: r.phone_number,
    country: r.country,
    country_name: COUNTRIES[r.country]?.name ?? r.country,
    status: r.status === 'verified' ? 'verified' : 'pending',
    method: r.method,
    verified_at: r.verified_at === null ? null : new Date(r.verified_at).toISOString(),
  };
}

/**
 * Why the user's own number can't be the caller ID on a call to `to`, or null when it can. Telnyx
 * refuses a caller ID it doesn't own on international calls (support.telnyx.com/en/articles/3546251),
 * so an own number only calls its own country, or any +1 number when it is a +1 number.
 */
export function ownNumberRefusal(own: Pick<VerifiedNumberRow, 'phone_number' | 'country'>, to: Extract<PhoneCheck, { ok: true }>): string | null {
  if (isHome(own.phone_number) ? to.home : own.country === to.country) return null;
  return `from: your own number ${formatPhone(own.phone_number)} can only call ${isHome(own.phone_number) ? 'US and Canadian' : `${COUNTRIES[own.country]?.name ?? own.country}`} numbers; the carrier refuses it as caller ID on international calls`;
}

/**
 * Europe, where any account may call businesses from any of its numbers: from a European number
 * when it holds one, else from its US number. EU and EEA countries, the UK and Switzerland; calls
 * there cost the carrier a few cents a minute at most.
 */
export const EUROPE = new Set([
  'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

/**
 * Countries any account may call from its free US number without holding a number there: Europe,
 * the UAE, where no carrier sells numbers to a company outside the country, and Japan, where the
 * carrier sells none and refuses a Japanese caller ID it didn't issue (so the user's own number
 * can't be verified there either), so a US caller ID is the only way in. Calls to both cost more
 * (lib/rates.ts).
 */
/** The reason a country isn't sold yet while its regulatory paperwork is pending. */
const awaitingApproval = (name: string) => `${name} numbers are waiting on regulatory approval`;

/** Whether an unavailable offer is held back by regulator paperwork, as opposed to the carrier having none in stock. */
export const isAwaitingApproval = (offer: CountryOffer) => !offer.available && offer.reason === awaitingApproval(offer.name);

export const FROM_HOME = new Set([...EUROPE, 'AE', 'JP']);

/** Every country some account may call: the telephone carrier must allow each of them. */
export const CALLABLE = [...new Set(['US', 'CA', ...FROM_HOME, ...Object.keys(COUNTRIES)])];

/** Whether the account may reach `to`: +1 numbers and FROM_HOME countries always, elsewhere a country it holds a number in. */
export async function mayCall(db: D1Database, accountId: string, to: Extract<PhoneCheck, { ok: true }>): Promise<boolean> {
  if (to.home || FROM_HOME.has(to.country)) return true;
  return Boolean(await db.prepare(`SELECT 1 FROM numbers WHERE account_id = ? AND country = ? AND status = 'active'`).bind(accountId, to.country).first());
}

/**
 * The carrier refusing a verification request or a code is the user's to fix (a number that
 * can't take texts, a wrong code); anything else is carrier trouble (carrier()).
 */
const refused = (err: unknown): err is TelnyxError => err instanceof TelnyxError && err.status >= 400 && err.status < 500 && ![401, 403, 429].includes(err.status);

export function numbers(env: Env) {
  const db = env.DB;
  const provider = telnyx(env);

  async function active(accountId: string): Promise<NumberRow[]> {
    const { results } = await db.prepare(`SELECT * FROM numbers WHERE account_id = ? AND status = 'active' ORDER BY included DESC, created_at`).bind(accountId).all<NumberRow>();
    return results;
  }

  /** Why `country` can't sell a number right now, or null when it can. */
  async function blocked(country: string): Promise<string | null> {
    const c = COUNTRIES[country];
    if (!c) return `numbers are not sold in ${country}; available: ${Object.keys(COUNTRIES).join(', ')}`;
    if (c.paused) return `${c.name} numbers are on hold: ${c.paused}`;
    if (c.requirementGroup && (await provider.requirementGroupStatus(c.requirementGroup)) !== 'approved') return awaitingApproval(c.name);
    return null;
  }

  /** Look up `country` at the carrier and store what a number costs there now. */
  async function refreshOffer(country: string): Promise<void> {
    const reason = await blocked(country);
    const quote = reason ? null : await provider.availableNumber({ country, type: COUNTRIES[country].type });
    await db
      .prepare(`INSERT OR REPLACE INTO number_offers (country, available, reason, upfront_cents, monthly_cents, checked_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(country, quote ? 1 : 0, quote ? null : (reason ?? `no ${COUNTRIES[country].name} numbers are for sale right now`), quote?.upfrontCents ?? null, quote?.monthlyCents ?? null, now())
      .run();
  }

  /** The account's own numbers, verified or waiting on their code. */
  async function own(accountId: string): Promise<VerifiedNumberRow[]> {
    const { results } = await db.prepare(`SELECT * FROM verified_numbers WHERE account_id = ? AND status IN ('pending', 'verified') ORDER BY created_at`).bind(accountId).all<VerifiedNumberRow>();
    return results;
  }

  /** Which account `e164` is verified for, if any. */
  async function verifiedFor(e164: string): Promise<VerifiedNumberRow | null> {
    return db.prepare(`SELECT * FROM verified_numbers WHERE phone_number = ? AND status = 'verified'`).bind(e164).first<VerifiedNumberRow>();
  }

  /** The E.164 form of an own number as people type it. */
  function ownE164(number: string): Extract<PhoneCheck, { ok: true }> {
    const p = checkDialable(number);
    if (!p.ok) throw new NumberError(`number: ${p.reason}`);
    return p;
  }

  /** Refuses a number some account (this one or another) already has verified. */
  async function assertUnclaimed(account: Account, e164: string): Promise<void> {
    const holder = await verifiedFor(e164);
    if (holder) throw new NumberError(holder.account_id === account.id ? `${formatPhone(e164)} is already verified on this account` : `${formatPhone(e164)} is verified on another call4me account; remove it there first`, 409);
  }

  /**
   * Refuses a number the carrier already lists as verified. Its verify call might accept it
   * without a fresh code, which would prove nothing about who holds the phone.
   */
  async function assertNotAtCarrier(e164: string): Promise<void> {
    if (!(await provider.verifiedNumber(e164))?.verifiedAt) return;
    console.error('verified at the carrier with no call4me account holding it', e164);
    throw new NumberError(`${formatPhone(e164)} can't be verified on call4me right now`, 409);
  }

  async function startVerification(account: Account, opts: { number: string; method: 'sms' | 'call'; extension?: string | null }): Promise<OwnNumberView> {
    const p = ownE164(opts.number);
    if (opts.extension && opts.method !== 'call') throw new NumberError('extension: only a verification call can dial an extension');
    if (!CALLABLE.includes(p.country)) throw new NumberError(`call4me doesn't place calls in ${p.country}, so a number there can't be verified`);
    if (await db.prepare(`SELECT 1 FROM numbers WHERE phone_number = ? AND status = 'active'`).bind(p.e164).first()) throw new NumberError(`${formatPhone(p.e164)} is a call4me number, not your own phone`, 409);
    await assertUnclaimed(account, p.e164);
    const sent = await db.prepare(`SELECT COUNT(*) AS n FROM verified_numbers WHERE account_id = ? AND created_at > ?`).bind(account.id, now() - DAY).first<{ n: number }>();
    if ((sent?.n ?? 0) >= VERIFICATIONS_PER_DAY) throw new NumberError(`at most ${VERIFICATIONS_PER_DAY} verification codes a day; try again tomorrow`, 429);
    await assertNotAtCarrier(p.e164);
    try {
      await provider.requestVerification(p.e164, opts.method, opts.extension);
    } catch (err) {
      if (refused(err)) throw new NumberError(`the carrier could not send a code to ${formatPhone(p.e164)}: ${err.detail}`);
      throw err;
    }
    // Only the newest code request counts; an older one waiting on its code is superseded.
    await db.prepare(`UPDATE verified_numbers SET status = 'expired' WHERE account_id = ? AND phone_number = ? AND status = 'pending'`).bind(account.id, p.e164).run();
    const id = newId();
    await db
      .prepare(`INSERT INTO verified_numbers (id, account_id, phone_number, country, method, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`)
      .bind(id, account.id, p.e164, p.country, opts.method, now())
      .run();
    return ownNumberView((await db.prepare(`SELECT * FROM verified_numbers WHERE id = ?`).bind(id).first<VerifiedNumberRow>())!);
  }

  async function confirmVerification(account: Account, number: string, code: string): Promise<OwnNumberView> {
    const p = ownE164(number);
    const row = await db
      .prepare(`SELECT * FROM verified_numbers WHERE account_id = ? AND phone_number = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`)
      .bind(account.id, p.e164)
      .first<VerifiedNumberRow>();
    if (!row) throw new NumberError(`no code is waiting for ${formatPhone(p.e164)}; request one first`, 404);
    await assertUnclaimed(account, p.e164);
    // Checked again here: another request's code may have been accepted since this one was sent.
    await assertNotAtCarrier(p.e164);
    try {
      await provider.submitVerificationCode(p.e164, code);
    } catch (err) {
      if (!refused(err)) throw err;
      const attempts = row.attempts + 1;
      const left = CODE_ATTEMPTS - attempts;
      await db.prepare(`UPDATE verified_numbers SET attempts = ?, status = ? WHERE id = ?`).bind(attempts, left > 0 ? 'pending' : 'expired', row.id).run();
      throw new NumberError(`that code was not accepted; ${left > 0 ? `${left} ${left === 1 ? 'try' : 'tries'} left` : 'request a new code'}`);
    }
    const at = now();
    await db.prepare(`UPDATE verified_numbers SET status = 'verified', verified_at = ? WHERE id = ?`).bind(at, row.id).run();
    return ownNumberView({ ...row, status: 'verified', verified_at: at });
  }

  async function removeOwn(account: Account, number: string): Promise<OwnNumberView> {
    const p = checkDialable(number);
    const e164 = p.ok ? p.e164 : number.trim();
    const row = await db.prepare(`SELECT * FROM verified_numbers WHERE account_id = ? AND phone_number = ? AND status IN ('pending', 'verified')`).bind(account.id, e164).first<VerifiedNumberRow>();
    if (!row) throw new NumberError('no such number on this account', 404);
    // Off the carrier's list too, so the next account to verify it starts from a fresh code.
    if (row.status === 'verified') await provider.deleteVerifiedNumber(row.phone_number);
    await db.prepare(`UPDATE verified_numbers SET status = 'removed', removed_at = ? WHERE id = ?`).bind(now(), row.id).run();
    return ownNumberView(row);
  }

  /** What buying `id` took from the balance, given back when its order fails. */
  async function refundOrder(row: Pick<NumberRow, 'id' | 'account_id' | 'phone_number'>, price: number): Promise<void> {
    // An order still pending may complete later: give the number back so it isn't held unpaid.
    await provider.releaseNumber(row.phone_number).catch((e) => console.error('releasing the failed order', row.phone_number, e));
    await accounts(db).post(row.account_id, price, 'refund', `number:${row.id}:refund`, `order failed for ${formatPhone(row.phone_number)}`);
  }

  /** Mark a pending number failed and refund what it took, once: a row already settled is left alone. */
  async function fail(row: NumberRow, at = now()): Promise<boolean> {
    const r = await db.prepare(`UPDATE numbers SET status = 'failed', released_at = ? WHERE id = ? AND status = 'pending'`).bind(at, row.id).run();
    if ((r.meta.changes ?? 0) === 0) return false;
    const paid = await db.prepare(`SELECT -amount_cents AS cents FROM ledger WHERE ref = ?`).bind(`number:${row.id}:buy`).first<{ cents: number }>();
    await refundOrder(row, paid?.cents ?? 0);
    return true;
  }

  /** A completed order: the number goes live and its first month starts now. */
  async function activate(row: NumberRow, at = now()): Promise<boolean> {
    const r = await db.prepare(`UPDATE numbers SET status = 'active', paid_through = ? WHERE id = ? AND status = 'pending'`).bind(at + RENEWAL_DAYS * DAY, row.id).run();
    return (r.meta.changes ?? 0) > 0;
  }

  /**
   * Buy a number. The price comes out of the balance and the number is recorded as pending in
   * the same moment, before the carrier is asked for anything: the request can be cut off at any
   * point after (an agent's tool call timing out, say) and the purchase is still on the account,
   * where settle() finishes it. A US or Canadian order usually completes within the short wait
   * here; one abroad goes to regulatory review and stays pending until settle() sees it through.
   * Only an order the carrier turns down, or one that never reached it, is refunded.
   */
  async function purchase(account: Account, opts: { country: string; areaCode?: string | null }): Promise<Bought> {
    const country = opts.country.trim().toUpperCase();
    const reason = await blocked(country);
    if (reason) throw new NumberError(reason, COUNTRIES[country] ? 409 : 400);
    const c = COUNTRIES[country];
    const waiting = await db.prepare(`SELECT phone_number FROM numbers WHERE account_id = ? AND country = ? AND status = 'pending'`).bind(account.id, country).first<{ phone_number: string }>();
    if (waiting) throw new NumberError(`your ${c.name} number ${formatPhone(waiting.phone_number)} is already paid for and waiting on the carrier's approval; it activates by itself, so there is nothing more to buy`, 409);
    const found = await provider.availableNumber({ country, type: c.type, areaCode: opts.areaCode ?? null });
    if (!found) throw new NumberError(`no ${c.name} numbers are for sale right now; try again later`, 503);

    // Calls to the country must be allowed before anyone pays for a number there.
    if (!isHome(found.phoneNumber)) await provider.allowDestinations([country]);

    const id = newId();
    const price = found.upfrontCents + found.monthlyCents;
    const ledger = accounts(db);
    const note = `${c.name} number ${formatPhone(found.phoneNumber)}: ${dollars(found.upfrontCents)} upfront + ${dollars(found.monthlyCents)} first month`;
    if (!(await ledger.spend(account.id, price, 'number', `number:${id}:buy`, note))) {
      throw new NumberError(`a ${c.name} number costs ${dollars(price)} today (then ${dollars(found.monthlyCents)}/month); the balance is ${dollars(await ledger.balanceCents(account.id))}. add credits first`, 402);
    }
    try {
      await db
        .prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, NULL, 'pending', ?)`)
        .bind(id, account.id, found.phoneNumber, country, c.type, found.monthlyCents, now())
        .run();
    } catch (err) {
      // Another purchase in this country got recorded first (numbers_one_pending): this one never ordered anything.
      console.error('recording the number purchase failed', id, err);
      await ledger.post(account.id, price, 'refund', `number:${id}:refund`, `${c.name} number already being bought`);
      throw new NumberError(`a ${c.name} number is already being bought on this account; nothing more was charged`, 409);
    }
    const row = (await db.prepare(`SELECT * FROM numbers WHERE id = ?`).bind(id).first<NumberRow>())!;

    let placed: { id: string; status: NumberOrderStatus };
    try {
      placed = await provider.orderNumber(found.phoneNumber, { requirementGroupId: c.requirementGroup ?? null, reference: orderReference(id), waitMs: PURCHASE_WAIT_MS });
    } catch (err) {
      console.error('number order failed', id, err);
      await fail(row);
      throw new NumberError('the carrier could not complete that number order; nothing was charged. try again shortly', 502);
    }
    await db.prepare(`UPDATE numbers SET order_id = ? WHERE id = ?`).bind(placed.id, id).run();
    if (placed.status === 'failure') {
      console.error('number order turned down', id, placed.id);
      await fail(row);
      throw new NumberError('the carrier turned down that number order; nothing was charged. try again shortly', 502);
    }
    if (placed.status === 'success') await activate(row);
    const bought = (await db.prepare(`SELECT * FROM numbers WHERE id = ?`).bind(id).first<NumberRow>())!;
    return bought.status === 'active' ? { number: numberView(bought) } : { pending: pendingNumberView(bought) };
  }

  /**
   * See pending purchases through: a completed order activates its number, one the carrier turned
   * down is refunded, and the rest keep waiting. A purchase cut off before its order id was saved
   * is found at the carrier by its reference; one that never reached the carrier is refunded once
   * ORDER_LOST_MS has passed.
   */
  async function settle(rows: NumberRow[], at = now()): Promise<{ activated: number; failed: number; waiting: number }> {
    const out = { activated: 0, failed: 0, waiting: 0 };
    for (const n of rows) {
      let status: NumberOrderStatus;
      try {
        if (n.order_id) {
          status = await provider.numberOrderStatus(n.order_id);
        } else {
          const found = await provider.findNumberOrder(orderReference(n.id));
          if (found) {
            await db.prepare(`UPDATE numbers SET order_id = ? WHERE id = ?`).bind(found.id, n.id).run();
            status = found.status;
          } else {
            status = at - n.created_at > ORDER_LOST_MS ? 'failure' : 'pending';
          }
        }
      } catch (err) {
        console.error('number order status failed', n.id, err);
        out.waiting++;
        continue;
      }
      if (status === 'pending') out.waiting++;
      else if (status === 'success') out.activated += Number(await activate(n, at));
      else out.failed += Number(await fail(n, at));
    }
    return out;
  }

  /** The free first number: no one has paid for it, so this waits as long as a US order can take. */
  async function order(found: AvailableNumber, country: string): Promise<void> {
    const placed = await provider.orderNumber(found.phoneNumber, { requirementGroupId: COUNTRIES[country].requirementGroup ?? null, waitMs: INCLUDED_WAIT_MS });
    if (placed.status !== 'success') throw new TelnyxError(`number order ${placed.id} for ${found.phoneNumber} is ${placed.status}`, 503);
  }



  return {
    active,

    async views(accountId: string): Promise<NumberView[]> {
      return (await active(accountId)).map((r) => numberView(r));
    },

    /** Numbers paid for and waiting on the carrier, checked with it first so one just approved shows as active. */
    async pendingViews(accountId: string): Promise<PendingNumberView[]> {
      const sql = `SELECT * FROM numbers WHERE account_id = ? AND status = 'pending' ORDER BY created_at`;
      const { results } = await db.prepare(sql).bind(accountId).all<NumberRow>();
      if (!results.length) return [];
      await settle(results);
      return (await db.prepare(sql).bind(accountId).all<NumberRow>()).results.map(pendingNumberView);
    },

    /** Every account's pending orders, from the cron. */
    async settlePending(at = now()): Promise<{ activated: number; failed: number; waiting: number }> {
      const { results } = await db.prepare(`SELECT * FROM numbers WHERE status = 'pending' ORDER BY created_at`).all<NumberRow>();
      return settle(results, at);
    },

    /** The user's own numbers on the account: verified to call from, or waiting on their code. */
    async ownViews(accountId: string): Promise<OwnNumberView[]> {
      return (await own(accountId)).map(ownNumberView);
    },

    /**
     * Have the carrier text `number` a code, or call it and read the code out (dialing `extension`
     * once answered). The number becomes the account's to call from once confirmVerification gets
     * that code back. At most VERIFICATIONS_PER_DAY requests a day.
     */
    async startVerification(account: Account, opts: { number: string; method: 'sms' | 'call'; extension?: string | null }): Promise<OwnNumberView> {
      return carrier(() => startVerification(account, opts));
    },

    /** Hand the code back. CODE_ATTEMPTS wrong codes and a new one has to be requested. */
    async confirmVerification(account: Account, number: string, code: string): Promise<OwnNumberView> {
      return carrier(() => confirmVerification(account, number, code));
    },

    /** Stop calling from one of the user's own numbers (or drop one waiting on its code). */
    async removeOwn(account: Account, number: string): Promise<OwnNumberView> {
      return carrier(() => removeOwn(account, number));
    },

    /** Every country numbers are sold in, with its price as of the last refresh (at most ~15 minutes old). */
    async offers(): Promise<CountryOffer[]> {
      const { results } = await db.prepare(`SELECT * FROM number_offers`).all<{ country: string; available: number; reason: string | null; upfront_cents: number | null; monthly_cents: number | null }>();
      const stored = new Map(results.map((r) => [r.country, r]));
      return Object.entries(COUNTRIES).map(([country, { name, type }]) => {
        const r = stored.get(country);
        if (!r) return { country, name, type, available: false, reason: 'prices are loading; check back in a few minutes', upfront_cents: null, monthly_cents: null, price: null, monthly: null };
        const priced = r.available && r.upfront_cents !== null && r.monthly_cents !== null;
        return {
          country,
          name,
          type,
          available: Boolean(r.available),
          reason: r.reason,
          upfront_cents: r.upfront_cents,
          monthly_cents: r.monthly_cents,
          price: priced ? dollars(r.upfront_cents! + r.monthly_cents!) : null,
          monthly: priced ? dollars(r.monthly_cents!) : null,
        };
      });
    },

    /** Re-price every country one at a time, gently on the carrier's rate limit. Run by the cron. */
    async refreshOffers(): Promise<{ refreshed: number; failed: number }> {
      const out = { refreshed: 0, failed: 0 };
      // Keep the carrier's destination whitelist in step with where accounts may call.
      await provider.allowDestinations(CALLABLE).catch((err) => console.error('destination whitelist update failed', err));
      for (const country of Object.keys(COUNTRIES)) {
        try {
          await refreshOffer(country);
          out.refreshed++;
        } catch (err) {
          console.error('number offer refresh failed', country, err);
          out.failed++;
        }
      }
      return out;
    },

    /**
     * Buy a number in `country` (ISO code), near `areaCode` when given. The upfront cost and first
     * month come out of the balance before the order; a failed order gives them back.
     */
    async buy(account: Account, opts: { country: string; areaCode?: string | null }): Promise<Bought> {
      return carrier(() => purchase(account, opts));
    },

    /** Give up a bought number. Its charges stop; what was paid is not refunded. The free number stays. */
    async release(account: Account, number: string): Promise<NumberView> {
      const parsed = checkDialable(number);
      const e164 = parsed.ok ? parsed.e164 : number.trim();
      const row = await db.prepare(`SELECT * FROM numbers WHERE account_id = ? AND phone_number = ? AND status IN ('active', 'pending')`).bind(account.id, e164).first<NumberRow>();
      if (!row) throw new NumberError('no such number on this account', 404);
      if (row.status === 'pending') throw new NumberError(`${formatPhone(row.phone_number)} is still waiting on the carrier's approval; it can be released once it's active`, 409);
      if (row.included) throw new NumberError('the free number that came with the account cannot be released', 409);
      await carrier(() => provider.releaseNumber(row.phone_number));
      await db.prepare(`UPDATE numbers SET status = 'released', released_at = ? WHERE id = ?`).bind(now(), row.id).run();
      return numberView({ ...row, status: 'released' });
    },

    /**
     * The number a call to `to` goes out from: `requested` when given (one of the account's
     * call4me numbers, or one of the user's own verified numbers: `own`), else one in the callee's
     * country, else (calling Europe) a European one, else (calling a +1 number or a FROM_HOME
     * country) its US number, buying the free one on the first call. An own number is never
     * picked unless requested.
     */
    async callerId(account: Account, to: Extract<PhoneCheck, { ok: true }>, requested?: string | null): Promise<{ number: string; own: boolean }> {
      const owned = await active(account.id);
      if (requested) {
        const p = checkDialable(requested);
        const match = p.ok && owned.find((n) => n.phone_number === p.e164);
        if (match) return { number: match.phone_number, own: false };
        const verified = p.ok ? await verifiedFor(p.e164) : null;
        if (verified?.account_id === account.id) {
          const refusal = ownNumberRefusal(verified, to);
          if (refusal) throw new NumberError(refusal, 422);
          return { number: verified.phone_number, own: true };
        }
        const choices = [...owned.map((n) => n.phone_number), ...(await own(account.id)).filter((n) => n.status === 'verified').map((n) => n.phone_number)];
        throw new NumberError(`from: ${requested} is not one of this account's numbers (${choices.map(formatPhone).join(', ') || 'none yet'})`);
      }
      const sameCountry = owned.find((n) => n.country === to.country);
      if (sameCountry) return { number: sameCountry.phone_number, own: false };
      if (EUROPE.has(to.country)) {
        const european = owned.find((n) => EUROPE.has(n.country));
        if (european) return { number: european.phone_number, own: false };
      }
      if (to.home || FROM_HOME.has(to.country)) return { number: owned.find((n) => isHome(n.phone_number))?.phone_number ?? (await this.ensureIncluded(account, to.e164)), own: false };
      throw new NumberError(`calling ${COUNTRIES[to.country]?.name ?? to.country} needs a number there; buy one with call4me_buy_number`, 422);
    },

    /** The account's free first number: a US local number, in the area code of the first place it calls when that is a +1 number. */
    async ensureIncluded(account: Account, nearE164: string): Promise<string> {
      const existing = await db.prepare(`SELECT phone_number FROM numbers WHERE account_id = ? AND included = 1 AND status = 'active'`).bind(account.id).first<{ phone_number: string }>();
      if (existing) return existing.phone_number;
      const found = await provider.availableNumber({ country: 'US', type: 'local', areaCode: isHome(nearE164) ? nearE164.slice(2, 5) : null });
      if (!found) throw new NumberError('no US numbers are for sale right now; try again shortly', 503);
      await order(found, 'US');
      const r = await db
        .prepare(`INSERT OR IGNORE INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at) VALUES (?, ?, ?, 'US', 'local', 1, 0, NULL, 'active', ?)`)
        .bind(newId(), account.id, found.phoneNumber, now())
        .run();
      // A concurrent first call bought one too and landed first: keep that one, return this one.
      if ((r.meta.changes ?? 0) === 0) await provider.releaseNumber(found.phoneNumber);
      return this.ensureIncluded(account, nearE164);
    },

    /**
     * Charge every number whose month is up. A renewal the balance can't cover is retried on each
     * run and the number released once the grace period passes.
     */
    async renewDue(at = now()): Promise<{ renewed: number; released: number; overdue: number }> {
      const { results } = await db.prepare(`SELECT * FROM numbers WHERE status = 'active' AND included = 0 AND paid_through <= ?`).bind(at).all<NumberRow>();
      const ledger = accounts(db);
      const out = { renewed: 0, released: 0, overdue: 0 };
      for (const n of results) {
        const paidThrough = n.paid_through!;
        const ref = `number:${n.id}:${paidThrough}`;
        const note = `${formatPhone(n.phone_number)} for ${RENEWAL_DAYS} days from ${day(paidThrough)}`;
        // The ref is per period: a run that charged but died before extending just extends.
        const paid = (await ledger.spend(n.account_id, n.monthly_cents, 'number', ref, note)) || Boolean(await db.prepare(`SELECT 1 FROM ledger WHERE ref = ?`).bind(ref).first());
        if (paid) {
          await db.prepare(`UPDATE numbers SET paid_through = ? WHERE id = ? AND paid_through = ?`).bind(paidThrough + RENEWAL_DAYS * DAY, n.id, paidThrough).run();
          out.renewed++;
        } else if (at >= paidThrough + GRACE_DAYS * DAY) {
          try {
            await provider.releaseNumber(n.phone_number);
            await db.prepare(`UPDATE numbers SET status = 'released', released_at = ? WHERE id = ?`).bind(at, n.id).run();
            out.released++;
          } catch (err) {
            console.error('number release failed', n.id, err);
          }
        } else {
          out.overdue++;
        }
      }
      return out;
    },
  };
}
