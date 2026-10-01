import { z } from 'zod';
import { ABROAD_CALLING } from './rates';

/** Shared by the MCP number tools, the /api/numbers routes and the OpenAPI document. */

// Output shapes are loose: MCP clients cache a tool's outputSchema and reject keys it doesn't
// list, so a field added later must not break a client that cached the older schema.
export const numberView = z.looseObject({
  number: z.string().describe('formatted for people'),
  e164: z.string(),
  country: z.string().describe('ISO 3166-1 alpha-2'),
  country_name: z.string(),
  type: z.string().describe('local, mobile, national or toll_free'),
  included: z.boolean().describe('the free number that came with the account'),
  monthly: z.string(),
  monthly_cents: z.number().int(),
  renews: z.string().nullable().describe('date the next monthly charge is due; null for the free number'),
  overdue: z.boolean().describe('the last renewal failed for lack of credits'),
  release_after: z.string().nullable().describe('when an overdue number is released unless credits are added'),
});

export const countryOffer = z.looseObject({
  country: z.string(),
  name: z.string(),
  type: z.string(),
  available: z.boolean(),
  reason: z.string().nullable().describe('why a number cannot be bought there right now'),
  upfront_cents: z.number().int().nullable(),
  monthly_cents: z.number().int().nullable(),
  price: z.string().nullable().describe('taken from the balance when buying: upfront cost plus the first month'),
  monthly: z.string().nullable(),
});

export const ownNumberView = z.looseObject({
  number: z.string().describe('formatted for people'),
  e164: z.string(),
  country: z.string().describe('ISO 3166-1 alpha-2'),
  country_name: z.string(),
  status: z.enum(['pending', 'verified']).describe('pending: the code was sent and has not come back yet'),
  method: z.enum(['sms', 'call']).describe('how the code was sent'),
  verified_at: z.string().nullable(),
});

export const numbersOutput = z.looseObject({
  numbers: z.array(numberView),
  own_numbers: z
    .array(ownNumberView)
    .optional()
    .describe('the user\'s own phone numbers, verified to call from: calls go out from one only when place_call names it in from. Omitted when the account has none'),
  countries: z.array(countryOffer),
});

export const buyNumberInput = z.object({
  country: z.string().regex(/^[A-Za-z]{2}$/).describe('ISO country code from the countries list, e.g. "NL", "GB", "CA", "US"'),
  area_code: z.string().regex(/^\d{2,5}$/).optional().describe('preferred area code (national destination code), e.g. "415" or "20"; the nearest available is used otherwise'),
});

export const releaseNumberInput = z.object({ number: z.string().min(3).max(40).describe('one of the account\'s numbers, e.g. "+31612345678"') });

/** Verification codes an account may request a day: each costs a carrier fee and texts or rings a phone. */
export const VERIFICATIONS_PER_DAY = 5;
/** Wrong codes accepted per request; after that a new code has to be requested. */
export const CODE_ATTEMPTS = 5;

const verificationCode = z.string().regex(/^[0-9A-Za-z]{3,12}$/).describe('the code the user received');

export const sendVerificationInput = z.object({
  number: z.string().min(3).max(40).describe('the user\'s own phone number, e.g. "+14155550123" or "(415) 555-0123"'),
  method: z.enum(['sms', 'call']).default('sms').describe('how to send the code: a text, or a call that reads it out (for landlines)'),
  extension: z
    .string()
    .regex(/^[0-9A-D*#wW]{1,50}$/)
    .optional()
    .describe('keys the verification call dials once answered, to get past a phone menu to an extension; w waits half a second, W one second. method "call" only'),
});

export const confirmVerificationInput = z.object({ code: verificationCode });

/** The MCP tool does both: without code it sends one, with code it submits it. */
export const verifyNumberInput = sendVerificationInput.extend({ code: verificationCode.optional().describe('the code the user received; leave out to send one') });

export const ownNumberInput = z.object({ number: z.string().min(3).max(40).describe('one of the user\'s own numbers on the account, e.g. "+14155550123"') });

export const listNumbersDescription =
  `The account's phone numbers, and the countries more can be bought in with today's prices. Calls go out from a number in the callee's country when the account holds one. US, Canadian and European businesses can always be called (Europe from a European number if the account has one, else from its US number), and ${ABROAD_CALLING}; elsewhere, a number in the country is what lets the account call there. Numbers cost exactly what the carrier charges: the upfront cost plus the first month when bought, then the monthly cost every 30 days, taken from the balance. own_numbers are the user's own phone numbers verified with call4me_verify_number: free, and used only when call4me_place_call names one in from.`;
export const buyNumberDescription =
  'Buy another phone number, in the US or abroad, paid from the balance at the carrier\'s own price (see call4me_list_numbers for prices). It renews from the balance every 30 days; if the balance can\'t cover a renewal the number is released after 7 days. Only buy when the user asks for a number or needs one to call a country.';
export const releaseNumberDescription =
  'Give up one of the account\'s bought numbers. Its monthly charge stops; what was already paid is not refunded, and the number cannot be gotten back. The free number that came with the account cannot be released. Only do this when the user asks.';

export const verifyNumberDescription =
  `Let calls show the user's own phone number instead of a call4me number. Without code: the carrier texts the number a code (or with method "call", calls it and reads the code out). Ask the user for the code they got, then call again with the same number and code. Free for the user; at most ${VERIFICATIONS_PER_DAY} codes a day, ${CODE_ATTEMPTS} tries per code. Once verified, call4me_place_call uses the number only when its from names it, and only to call businesses in the number's own country (any US or Canadian number for a +1 number). Businesses then see the user's number and call back their phone directly, so call4me cannot finish a task on a callback. Only verify a number the user asked to call from.`;
export const sendVerificationDescription = `Send a verification code to the user's own phone number: a text, or a call that reads the code out. Submit the code with POST /api/numbers/own/{number}/verify. At most ${VERIFICATIONS_PER_DAY} codes a day.`;
export const confirmVerificationDescription = 'Submit the code the user\'s own number received. Once accepted, calls can go out from it (from in call4me_place_call), to businesses in its own country.';
export const removeOwnNumberDescription = 'Stop calling from one of the user\'s own numbers, or drop one still waiting on its code. Verifying it again needs a new code. Only do this when the user asks.';

export const numbersPath = '/api/numbers';
export const numberPath = '/api/numbers/{number}';
export const ownNumbersPath = '/api/numbers/own';
export const ownNumberPath = '/api/numbers/own/{number}';
export const ownNumberVerifyPath = '/api/numbers/own/{number}/verify';
