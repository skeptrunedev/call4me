/**
 * Where call4me calls without the account holding a number in the country, and the same list in
 * words for tool descriptions and pages, so what agents are told can't fall behind what is allowed.
 */

/**
 * Europe, where any account may call businesses from any of its numbers: from a European number
 * when it holds one, else from its US number. EU and EEA countries, the UK and Switzerland; calls
 * there cost the carrier a few cents a minute at most.
 */
export const EUROPE = new Set([
  'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

/**
 * The EEA (Europe less the UK and Switzerland). A call into it from an EEA caller ID is charged the
 * carrier's local rate; from anywhere else some carriers add a surcharge: Greek mobiles cost
 * $0.0325/min from an EEA number and $0.4611/min from a US one (lib/rates.ts).
 */
export const EEA = new Set([...EUROPE].filter((c) => c !== 'GB' && c !== 'CH'));

/**
 * Countries any account may call from its free US number without holding a number there: Europe,
 * the UAE, where no carrier sells numbers to a company outside the country, and Japan, where the
 * carrier sells none and refuses a Japanese caller ID it didn't issue (so the user's own number
 * can't be verified there either), so a US caller ID is the only way in. Thailand too, so a user
 * needn't buy a number there for one call (Claudia, 2026-11-03), and Brazil, Nepal and Uzbekistan,
 * where call4me sells no numbers (Eduardo, Michael and Stanislav, 2026-11-03 to -07), then Indonesia
 * (2026-11-10) and Australia (2026-11-22). Calls to the UAE and Japan cost more (lib/rates.ts).
 */
export const FROM_HOME = new Set([...EUROPE, 'AE', 'JP', 'TH', 'BR', 'NP', 'UZ', 'ID', 'AU']);

/** Names a description uses where the region's English name reads badly in a sentence. */
const SHORT_NAMES: Readonly<Record<string, string>> = { AE: 'the UAE' };
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** FROM_HOME beyond Europe by name: "the UAE", "Japan", ... "Australia". */
export const FROM_HOME_PLACES: readonly string[] = [...FROM_HOME].filter((c) => !EUROPE.has(c)).map((c) => SHORT_NAMES[c] ?? regionNames.of(c) ?? c);

/** "a, b and c", the house style (no serial comma). */
export const andList = (items: readonly string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** Calling coverage for descriptions; current prices are returned by the account tools. */
export const ABROAD_CALLING = `businesses in ${andList(FROM_HOME_PLACES)} too, from the account's US number (the business sees a US caller ID)`;
