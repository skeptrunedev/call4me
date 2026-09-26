import { describe, expect, it } from 'vitest';
import { checkDialable, formatPhone } from '../src/server/lib/phone';

describe('checkDialable', () => {
  it.each([
    ['(415) 555-0123', '+14155550123'],
    ['415.555.0123', '+14155550123'],
    ['+1 415 555 0123', '+14155550123'],
    ['14165550123', '+14165550123'], // Toronto
  ])('accepts %s', (input, e164) => expect(checkDialable(input)).toEqual({ ok: true, e164 }));

  it.each(['911', '+1 911', '411', '+44 20 7946 0000', '+1 900 555 0123', '+1 876 555 0123', '555-0123', '+1 415 911 0123', '+1 115 555 0123'])('rejects %s', (input) => {
    expect(checkDialable(input).ok).toBe(false);
  });

  it('formats', () => expect(formatPhone('+14155550123')).toBe('(415) 555-0123'));
});
