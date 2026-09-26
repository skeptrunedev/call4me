/**
 * Which numbers callbay will dial: US and Canadian numbers only (+1, excluding the
 * Caribbean and Atlantic NANP countries, which bill as international and are the usual
 * toll-fraud targets), never emergency or N11 service codes, never premium-rate 900/976.
 */

/** NANP area codes that belong to countries other than the US and Canada. */
const FOREIGN_NANP = new Set([
  '242', '246', '264', '268', '284', '345', '441', '473', '649', '658', '664', '721', '758', '767', '784', '809', '829', '849', '868', '869', '876',
]);
const PREMIUM = new Set(['900', '976']);

export type PhoneCheck = { ok: true; e164: string } | { ok: false; reason: string };

/** Accepts "+1 (415) 555-0123", "415.555.0123", "14155550123"; returns +14155550123. */
export function checkDialable(input: string): PhoneCheck {
  const trimmed = input.trim();
  if (/^\+(?!1)/.test(trimmed)) return { ok: false, reason: 'only US and Canadian numbers (+1) can be called' };
  let digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 3 && /^[2-9]11$/.test(digits)) return { ok: false, reason: 'emergency and N11 service numbers cannot be called' };
  if (digits.length !== 10) return { ok: false, reason: 'expected a 10-digit US or Canadian phone number' };
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d\d$/.test(area) || !/^[2-9]\d\d$/.test(exchange)) return { ok: false, reason: 'not a valid North American phone number' };
  if (/^[2-9]11$/.test(area) || /^[2-9]11$/.test(exchange)) return { ok: false, reason: 'N11 service codes cannot be called' };
  if (PREMIUM.has(area)) return { ok: false, reason: 'premium-rate numbers cannot be called' };
  if (FOREIGN_NANP.has(area)) return { ok: false, reason: 'only US and Canadian numbers can be called' };
  return { ok: true, e164: `+1${digits}` };
}

/** +14155550123 -> (415) 555-0123 */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
