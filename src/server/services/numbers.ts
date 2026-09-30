import { newId, now } from '../lib/ids';
import { checkDialable, formatPhone, type PhoneCheck } from '../lib/phone';
import { telnyx, TelnyxError, type AvailableNumber } from '../lib/telnyx';
import { accounts, dollars, type Account } from './accounts';

/**
 * The phone numbers an account holds. Its first US number is free and bought on its first
 * call. Every other number, in the US or abroad, is paid from credits at exactly what Telnyx
 * charges: the upfront and first month's cost when bought, then the monthly cost every 30
 * days. A number whose renewal the balance can't cover is released after a grace period.
 * Owning a number in a country is what lets an account call businesses there.
 */

/**
 * Where numbers are sold: the number type offered in each country and, where the country's
 * regulator requires paperwork, the Telnyx requirement group holding it. A country with a
 * requirement group sells numbers only once Telnyx has approved that group.
 */
export const COUNTRIES: Record<string, { name: string; type: string; requirementGroup?: string }> = {
  US: { name: 'United States', type: 'local' },
  CA: { name: 'Canada', type: 'local' },
  PR: { name: 'Puerto Rico', type: 'local' },
  GB: { name: 'United Kingdom', type: 'local', requirementGroup: '56b7c2a9-0a26-4a9d-8a9c-4b468f19b8d6' },
  NL: { name: 'Netherlands', type: 'mobile', requirementGroup: 'd218655e-2634-4dcb-82e0-543c02919e63' },
  MX: { name: 'Mexico', type: 'local', requirementGroup: '93bc615f-78c9-4d0f-9db7-95e9f3b70fb4' },
  DK: { name: 'Denmark', type: 'mobile', requirementGroup: '91eb2437-7949-4683-9906-d340e655daee' },
  IS: { name: 'Iceland', type: 'local', requirementGroup: '8d2244f9-dc62-400c-8672-9fae946fc5bd' },
  LT: { name: 'Lithuania', type: 'mobile', requirementGroup: '333570f7-30c9-4302-98c8-353fdb1955af' },
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
  NI: { name: 'Nicaragua', type: 'mobile', requirementGroup: 'f59a2236-08ed-4514-a067-216b7d6fa2a4' },
};

const DAY = 24 * 60 * 60 * 1000;
export const RENEWAL_DAYS = 30;
/** How long a number is kept after its renewal failed for lack of credits. */
export const GRACE_DAYS = 7;

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
  status: 'active' | 'released';
  created_at: number;
  released_at: number | null;
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

/** Whether the account may reach `country`: any +1 number, or a country it holds a number in. */
export async function mayCall(db: D1Database, accountId: string, to: Extract<PhoneCheck, { ok: true }>): Promise<boolean> {
  if (to.home) return true;
  return Boolean(await db.prepare(`SELECT 1 FROM numbers WHERE account_id = ? AND country = ? AND status = 'active'`).bind(accountId, to.country).first());
}

/** A NANP (+1) number: US, Canadian and Puerto Rican numbers call each other's businesses. */
const isHome = (e164: string) => e164.startsWith('+1');

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
    if (c.requirementGroup && (await provider.requirementGroupStatus(c.requirementGroup)) !== 'approved') return `${c.name} numbers are waiting on regulatory approval`;
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

  async function order(found: AvailableNumber, country: string): Promise<void> {
    await provider.orderNumber(found.phoneNumber, COUNTRIES[country].requirementGroup ?? null);
  }

  async function purchase(account: Account, opts: { country: string; areaCode?: string | null }): Promise<NumberView> {
    const country = opts.country.trim().toUpperCase();
    const reason = await blocked(country);
    if (reason) throw new NumberError(reason, COUNTRIES[country] ? 409 : 400);
    const c = COUNTRIES[country];
    const found = await provider.availableNumber({ country, type: c.type, areaCode: opts.areaCode ?? null });
    if (!found) throw new NumberError(`no ${c.name} numbers are for sale right now; try again later`, 503);

    // Calls to the country must be allowed before anyone pays for a number there.
    if (!isHome(found.phoneNumber)) await provider.allowDestination(country);

    const id = newId();
    const price = found.upfrontCents + found.monthlyCents;
    const ledger = accounts(db);
    const note = `${c.name} number ${formatPhone(found.phoneNumber)}: ${dollars(found.upfrontCents)} upfront + ${dollars(found.monthlyCents)} first month`;
    if (!(await ledger.spend(account.id, price, 'number', `number:${id}:buy`, note))) {
      throw new NumberError(`a ${c.name} number costs ${dollars(price)} today (then ${dollars(found.monthlyCents)}/month); the balance is ${dollars(await ledger.balanceCents(account.id))}. add credits first`, 402);
    }
    try {
      await order(found, country);
    } catch (err) {
      console.error('number order failed', id, err);
      // An order still pending may complete later: give the number back so it isn't held unpaid.
      await provider.releaseNumber(found.phoneNumber).catch((e) => console.error('releasing the failed order', found.phoneNumber, e));
      await ledger.post(account.id, price, 'refund', `number:${id}:refund`, `order failed for ${formatPhone(found.phoneNumber)}`);
      throw new NumberError('the carrier could not complete that number order; nothing was charged. try again shortly', 502);
    }
    const at = now();
    await db
      .prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'active', ?)`)
      .bind(id, account.id, found.phoneNumber, country, c.type, found.monthlyCents, at + RENEWAL_DAYS * DAY, at)
      .run();
    return numberView((await db.prepare(`SELECT * FROM numbers WHERE id = ?`).bind(id).first<NumberRow>())!);
  }

  return {
    active,

    async views(accountId: string): Promise<NumberView[]> {
      return (await active(accountId)).map((r) => numberView(r));
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
    async buy(account: Account, opts: { country: string; areaCode?: string | null }): Promise<NumberView> {
      return carrier(() => purchase(account, opts));
    },

    /** Give up a bought number. Its charges stop; what was paid is not refunded. The free number stays. */
    async release(account: Account, number: string): Promise<NumberView> {
      const parsed = checkDialable(number);
      const e164 = parsed.ok ? parsed.e164 : number.trim();
      const row = await db.prepare(`SELECT * FROM numbers WHERE account_id = ? AND phone_number = ? AND status = 'active'`).bind(account.id, e164).first<NumberRow>();
      if (!row) throw new NumberError('no such number on this account', 404);
      if (row.included) throw new NumberError('the free number that came with the account cannot be released', 409);
      await carrier(() => provider.releaseNumber(row.phone_number));
      await db.prepare(`UPDATE numbers SET status = 'released', released_at = ? WHERE id = ?`).bind(now(), row.id).run();
      return numberView({ ...row, status: 'released' });
    },

    /**
     * The number a call to `to` goes out from: `requested` when given (it must be one of the
     * account's), else one in the callee's country, else (calling a +1 number) any +1 number
     * the account holds, buying the free one on the first call.
     */
    async callerId(account: Account, to: Extract<PhoneCheck, { ok: true }>, requested?: string | null): Promise<string> {
      const owned = await active(account.id);
      if (requested) {
        const p = checkDialable(requested);
        const match = p.ok && owned.find((n) => n.phone_number === p.e164);
        if (!match) throw new NumberError(`from: ${requested} is not one of this account's numbers (${owned.map((n) => formatPhone(n.phone_number)).join(', ') || 'none yet'})`);
        return match.phone_number;
      }
      const sameCountry = owned.find((n) => n.country === to.country);
      if (sameCountry) return sameCountry.phone_number;
      if (to.home) return owned.find((n) => isHome(n.phone_number))?.phone_number ?? (await this.ensureIncluded(account, to.e164));
      throw new NumberError(`calling ${COUNTRIES[to.country]?.name ?? to.country} needs a number there; buy one with callbay_buy_number`, 422);
    },

    /** The account's free first number: a US local number in the area code of the first place it calls. */
    async ensureIncluded(account: Account, nearE164: string): Promise<string> {
      const existing = await db.prepare(`SELECT phone_number FROM numbers WHERE account_id = ? AND included = 1 AND status = 'active'`).bind(account.id).first<{ phone_number: string }>();
      if (existing) return existing.phone_number;
      const found = await provider.availableNumber({ country: 'US', type: 'local', areaCode: nearE164.slice(2, 5) });
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
