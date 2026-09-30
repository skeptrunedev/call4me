import { parsePhoneNumberFromString, type NumberType } from 'libphonenumber-js/max';

/**
 * Which numbers call4me will dial. At home: US and Canadian numbers (+1, excluding the
 * Caribbean and Atlantic NANP countries, which bill as international and are the usual
 * toll-fraud targets), never emergency or N11 service codes, never premium-rate 900/976.
 * Abroad: valid landline, mobile and toll-free numbers, never premium-rate or shared-cost
 * ones. Whether an account may call a foreign country is decided by the numbers it owns
 * (services/numbers.ts), not here.
 */

/** NANP area codes that belong to countries other than the US and Canada. */
const FOREIGN_NANP = new Set([
  '242', '246', '264', '268', '284', '345', '441', '473', '649', '658', '664', '721', '758', '767', '784', '809', '829', '849', '868', '869', '876',
]);
const PREMIUM = new Set(['900', '976']);
/** Number types that cost the caller extra or reach no business. */
const UNCALLABLE: Set<NumberType> = new Set(['PREMIUM_RATE', 'SHARED_COST', 'PERSONAL_NUMBER', 'PAGER', 'VOICEMAIL']);

/** `country` is ISO 3166-1 alpha-2; `home` marks the +1 numbers every account may call. */
export type PhoneCheck = { ok: true; e164: string; country: string; home: boolean } | { ok: false; reason: string };

/** Accepts "+1 (415) 555-0123", "415.555.0123", "14155550123", "+44 20 7946 0958", "0044 20 7946 0958". */
export function checkDialable(input: string): PhoneCheck {
  const trimmed = input.trim();
  return /^(\+|00)(?!1)/.test(trimmed) ? checkAbroad(trimmed.replace(/^00/, '+')) : checkHome(trimmed);
}

function checkHome(trimmed: string): PhoneCheck {
  let digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 3 && /^[2-9]11$/.test(digits)) return { ok: false, reason: 'emergency and N11 service numbers cannot be called' };
  if (digits.length !== 10) return { ok: false, reason: 'expected a 10-digit US or Canadian phone number, or an international number starting with + and its country code' };
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d\d$/.test(area) || !/^[2-9]\d\d$/.test(exchange)) return { ok: false, reason: 'not a valid North American phone number' };
  if (/^[2-9]11$/.test(area) || /^[2-9]11$/.test(exchange)) return { ok: false, reason: 'N11 service codes cannot be called' };
  if (PREMIUM.has(area)) return { ok: false, reason: 'premium-rate numbers cannot be called' };
  if (FOREIGN_NANP.has(area)) return { ok: false, reason: 'Caribbean and Atlantic +1 numbers cannot be called' };
  const e164 = `+1${digits}`;
  return { ok: true, e164, country: parsePhoneNumberFromString(e164)?.country ?? 'US', home: true };
}

function checkAbroad(plus: string): PhoneCheck {
  const parsed = parsePhoneNumberFromString(plus);
  if (!parsed?.isValid() || !parsed.country) return { ok: false, reason: 'not a valid phone number; write international numbers with their country code, e.g. +31 20 123 4567' };
  const type = parsed.getType();
  if (type && UNCALLABLE.has(type)) return { ok: false, reason: 'premium-rate, shared-cost and personal numbers cannot be called' };
  return { ok: true, e164: parsed.number, country: parsed.country, home: false };
}

/** +14155550123 -> (415) 555-0123; +31201234567 -> +31 20 123 4567 */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
