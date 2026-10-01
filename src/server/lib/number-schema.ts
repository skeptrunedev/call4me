import { z } from 'zod';
import { UAE_CALLING } from './rates';

/** Shared by the MCP number tools, the /api/numbers routes and the OpenAPI document. */

export const numberView = z.object({
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

export const countryOffer = z.object({
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

export const numbersOutput = z.object({ numbers: z.array(numberView), countries: z.array(countryOffer) });

export const buyNumberInput = z.object({
  country: z.string().regex(/^[A-Za-z]{2}$/).describe('ISO country code from the countries list, e.g. "NL", "GB", "CA", "US"'),
  area_code: z.string().regex(/^\d{2,5}$/).optional().describe('preferred area code (national destination code), e.g. "415" or "20"; the nearest available is used otherwise'),
});

export const releaseNumberInput = z.object({ number: z.string().min(3).max(40).describe('one of the account\'s numbers, e.g. "+31612345678"') });

export const listNumbersDescription =
  `The account's phone numbers, and the countries more can be bought in with today's prices. Calls go out from a number in the callee's country when the account holds one. US, Canadian and European businesses can always be called (Europe from a European number if the account has one, else from its US number), and ${UAE_CALLING}; elsewhere, a number in the country is what lets the account call there. Numbers cost exactly what the carrier charges: the upfront cost plus the first month when bought, then the monthly cost every 30 days, taken from the balance.`;
export const buyNumberDescription =
  'Buy another phone number, in the US or abroad, paid from the balance at the carrier\'s own price (see call4me_list_numbers for prices). It renews from the balance every 30 days; if the balance can\'t cover a renewal the number is released after 7 days. Only buy when the user asks for a number or needs one to call a country.';
export const releaseNumberDescription =
  'Give up one of the account\'s bought numbers. Its monthly charge stops; what was already paid is not refunded, and the number cannot be gotten back. The free number that came with the account cannot be released. Only do this when the user asks.';

export const numbersPath = '/api/numbers';
export const numberPath = '/api/numbers/{number}';
