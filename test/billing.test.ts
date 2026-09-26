import { describe, expect, it } from 'vitest';
import { billedCents, localTimeIn } from '../src/server/services/calls';
import { parseAmountCents, TopupError } from '../src/server/services/topups';

describe('billing', () => {
  it('rounds talk time up to the minute', () => {
    expect(billedCents(1, 25)).toBe(25);
    expect(billedCents(60, 25)).toBe(25);
    expect(billedCents(61, 25)).toBe(50);
  });
});

describe('parseAmountCents', () => {
  it('parses dollars', () => expect(parseAmountCents('$25.50')).toBe(2550));
  it('enforces the $20 minimum', () => expect(() => parseAmountCents('19.99')).toThrow(TopupError));
  it('rejects junk', () => expect(() => parseAmountCents('abc')).toThrow(TopupError));
});

describe('localTimeIn', () => {
  it('formats in the zone', () => expect(localTimeIn('America/New_York', new Date('2026-10-02T19:04:00Z'))).toBe('Friday, October 2, 2026 at 3:04 PM'));
  it('is null without a zone', () => expect(localTimeIn(null)).toBeNull());
});
