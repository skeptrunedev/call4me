import assert from 'node:assert/strict';
import test from 'node:test';
import { ABROAD_CALLING, EUROPE, FROM_HOME, FROM_HOME_PLACES } from '../src/server/lib/coverage';
import { listNumbersDescription } from '../src/server/lib/number-schema';
import { call4meSkillMd } from '../src/server/lib/call4me-skill';

// The tool descriptions said "the UAE and Japan" for weeks after Thailand, Brazil, Nepal,
// Uzbekistan, Indonesia and Australia could be called too (Nov 22, 2026).
test('every country callable from the US number is named to agents', () => {
  const beyondEurope = [...FROM_HOME].filter((c) => !EUROPE.has(c));
  assert.equal(FROM_HOME_PLACES.length, beyondEurope.length);
  for (const place of FROM_HOME_PLACES) assert.doesNotMatch(place, /^[A-Z]{2}$/, `${place} has no English name`);
  for (const text of [ABROAD_CALLING, listNumbersDescription, call4meSkillMd('https://call4.me', 25)]) {
    for (const place of ['Australia', 'Indonesia', 'Thailand', 'Japan', 'the UAE']) assert.ok(text.includes(place), `${place} missing`);
  }
});
