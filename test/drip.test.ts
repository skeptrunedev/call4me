import { describe, expect, it } from 'vitest';
import { STEPS, unsubscribeUrl, validUnsubscribe, withFooter, type DripState } from '../src/server/services/drip';

const ctx = { origin: 'https://call4.me', pricePerMinuteCents: 25 };
const step = (id: string) => STEPS.find((s) => s.id === id)!;
const state = (s: Partial<DripState>): DripState => ({ funded: false, connected: false, calls: 0, ...s });

describe('signup drip', () => {
  it('welcomes everyone, and only asks for credits when there are none', () => {
    expect(step('welcome').email(state({}), ctx)!.body).toContain('https://call4.me/#buy');
    expect(step('welcome').email(state({ funded: true }), ctx)!.body).not.toContain('#buy');
  });

  it('nudges on day 1 by what is missing, and stays quiet once they have called', () => {
    expect(step('day1').email(state({}), ctx)!.subject).toBe('your first call');
    expect(step('day1').email(state({}), ctx)!.body).toContain('$0.25 a minute');
    expect(step('day1').email(state({ funded: true }), ctx)!.subject).toBe('one step left');
    expect(step('day1').email(state({ funded: true, connected: true }), ctx)!.subject).toBe('try your first call');
    expect(step('day1').email(state({ funded: true, connected: true, calls: 1 }), ctx)).toBeNull();
  });

  it('checks in on day 4 either way', () => {
    expect(step('day4').email(state({ calls: 3 }), ctx)!.body).toContain('3 calls');
    expect(step('day4').email(state({}), ctx)!.subject).toBe('anything in the way?');
  });

  it('writes plain, human email: no em dashes, signed by nick', () => {
    const all = [state({}), state({ funded: true }), state({ funded: true, connected: true }), state({ calls: 2 })];
    for (const s of STEPS) for (const st of all) {
      const e = s.email(st, ctx);
      if (!e) continue;
      expect(e.body + e.subject, s.id).not.toMatch(/—/);
      expect(e.body.trim().endsWith('nick'), s.id).toBe(true);
    }
  });

  it('signs unsubscribe links per account', async () => {
    const url = await unsubscribeUrl('https://call4.me', 'secret', 'acct_1');
    const sig = new URL(url).searchParams.get('s')!;
    expect(await validUnsubscribe('secret', 'acct_1', sig)).toBe(true);
    expect(await validUnsubscribe('secret', 'acct_2', sig)).toBe(false);
    expect(withFooter({ subject: 'x', body: 'hi' }, url).body).toContain(url);
  });
});
