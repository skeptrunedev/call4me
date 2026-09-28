import { describe, expect, it } from 'vitest';
import { signupEmail } from '../src/server/services/signups';

const base = { id: 'acct_1', email: 'kyle@example.com', display_name: 'Kyle', created_at: Date.UTC(2026, 8, 28, 9, 30), provider: 'google' };

describe('signup notice', () => {
  it('says who signed up and how', () => {
    const e = signupEmail(base, 'https://call4.me');
    expect(e.subject).toBe('new Call for Me signup: kyle@example.com');
    expect(e.text).toContain('kyle@example.com (Kyle) signed in with Google.');
    expect(e.text).toContain('when: 2026-09-28 09:30 UTC');
    expect(e.text).toContain('npm run grant -- kyle@example.com 25');
  });
  it('names X sign-ins and checkout-created accounts', () => {
    expect(signupEmail({ ...base, provider: 'twitter' }, 'o').text).toContain('signed in with X.');
    expect(signupEmail({ ...base, provider: null }, 'o').text).toContain('paid at checkout before signing in.');
  });
  it("uses the display name when X gave no email", () => {
    expect(signupEmail({ ...base, email: 'u1@users.invalid', provider: 'twitter' }, 'o').subject).toBe('new Call for Me signup: Kyle (no email)');
  });
});
