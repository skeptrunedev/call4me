import { describe, expect, it } from 'vitest';
import { isSomeoneElse } from '../src/server/services/calls';
import { categoryBySlug, missingMessage, resolveIntake } from '../src/server/services/intake';

const medical = categoryBySlug('medical')!;
const profile = { full_name: 'Nick Khami', date_of_birth: '1990-03-14', phone: '(415) 555-0123', insurance_carrier: 'Aetna PPO', insurance_member_id: 'W123456789' };

describe('resolveIntake', () => {
  it('fills profile fields and reports per-call ones as missing', () => {
    const r = resolveIntake(medical, {}, profile);
    expect(r.missing.map((f) => f.key).sort()).toEqual(['availability', 'patient_status', 'reason']);
    expect(r.known.find((k) => k.key === 'patient_date_of_birth')?.value).toBe('1990-03-14');
  });

  it('is complete when the call supplies the rest', () => {
    const r = resolveIntake(medical, { reason: 'annual physical', patient_status: 'existing', availability: 'weekday mornings' }, profile);
    expect(r.missing).toEqual([]);
    expect(r.invalid).toEqual([]);
  });

  it('asks for everything with an empty profile', () => {
    const r = resolveIntake(medical, {}, {});
    expect(r.missing.map((f) => f.key)).toEqual(expect.arrayContaining(['patient_full_name', 'patient_date_of_birth', 'phone', 'insurance_carrier', 'insurance_member_id']));
  });

  it('needs no member id when self-pay', () => {
    const r = resolveIntake(medical, { insurance_carrier: 'self-pay' }, { full_name: 'A B', date_of_birth: '1990-01-01', phone: '4155550123' });
    expect(r.missing.map((f) => f.key)).not.toContain('insurance_member_id');
  });

  it('lets a call override the profile (booking for a family member)', () => {
    const r = resolveIntake(medical, { patient_full_name: 'Maya Khami', patient_date_of_birth: '2018-06-01' }, profile);
    expect(r.known.find((k) => k.key === 'patient_full_name')?.value).toBe('Maya Khami');
  });

  it('rejects a malformed date of birth', () => {
    const r = resolveIntake(medical, { patient_date_of_birth: 'sometime in the 90s' }, profile);
    expect(r.invalid.map((i) => i.field.key)).toEqual(['patient_date_of_birth']);
  });

  it('general questions need only the question', () => {
    expect(resolveIntake(categoryBySlug('general')!, { questions: 'are you open sunday?' }, {}).missing).toEqual([]);
  });
});

describe('missingMessage', () => {
  it('lists the exact questions and points at the profile', () => {
    const m = missingMessage(medical, resolveIntake(medical, {}, {}));
    expect(m).toMatch(/^Not calling yet/);
    expect(m).toContain("patient_date_of_birth: What's your date of birth?");
    expect(m).toContain('callbay_save_profile');
  });
});

describe('anyOf groups and secrets', () => {
  const cat = {
    slug: 't',
    name: 'Test',
    examples: '',
    fields: [
      { key: 'confirmation_code', label: 'confirmation code', ask: 'code?', required: true, anyOf: 'booking' },
      { key: 'ticket_number', label: 'ticket number', ask: 'ticket?', required: true, anyOf: 'booking' },
      { key: 'account_pin', label: 'account PIN', ask: 'pin?', required: false, sensitive: true },
    ],
  };

  it('reports a missing group once, naming the alternatives', () => {
    const r = resolveIntake(cat, {}, {});
    expect(r.missing.map((f) => f.key)).toEqual(['confirmation_code']);
    expect(missingMessage(cat, r)).toContain('confirmation_code (or instead: ticket_number): code?');
  });

  it('any member satisfies the group', () => expect(resolveIntake(cat, { ticket_number: '0161234567890' }, {}).missing).toEqual([]));

  it('flags secrets', () => expect(resolveIntake(cat, { ticket_number: 'x', account_pin: '4821' }, {}).known.find((k) => k.key === 'account_pin')?.sensitive).toBe(true));
});

describe('home internet and flights', () => {
  const profile = { full_name: 'Nick Khami', date_of_birth: '1990-03-14', phone: '4155550123', email: 'n@example.com', address: '1 Main St Apt 4, SF CA 94110' };

  it('existing internet account: the PIN is required and secret; address can stand in for the account number', () => {
    const cat = categoryBySlug('internet_existing_account')!;
    const r = resolveIntake(cat, { request: 'outage since 9am, restarted', limits: 'none' }, profile);
    expect(r.missing.map((f) => f.key)).toEqual(['account_pin']);
    const ok = resolveIntake(cat, { request: 'outage', limits: 'none', account_pin: '4821' }, profile);
    expect(ok.missing).toEqual([]);
    expect(ok.known.find((k) => k.key === 'account_pin')?.sensitive).toBe(true);
    expect(ok.known.find((k) => k.key === 'limits')?.grants).toBe(true);
  });

  it('new internet service must settle the credit check route up front', () => {
    const r = resolveIntake(categoryBySlug('internet_new_service')!, { plan: '500 Mbps', start: 'Oct 1, self-install' }, profile);
    expect(r.missing.map((f) => f.key)).toEqual(['credit_check']);
  });

  it('flight change needs a booking reference, the refund decision, and acceptable alternatives', () => {
    const cat = categoryBySlug('flight_change')!;
    const r = resolveIntake(cat, { airline: 'United, booked direct', current_flight: 'UA 123 Oct 3 SFO-EWR', situation: 'cancelled' }, profile);
    expect(r.missing.map((f) => f.key)).toEqual(['confirmation_code', 'refund_or_rebook', 'acceptable']);
    const bad = resolveIntake(cat, { confirmation_code: 'ABC' }, profile);
    expect(bad.invalid.map((i) => i.field.key)).toEqual(['confirmation_code']);
  });
});

describe('decisions reach the caller as allowances', () => {
  it('marks the refund decision and credit-check route as grants', () => {
    for (const [slug, key] of [['flight_change', 'refund_or_rebook'], ['internet_new_service', 'credit_check']]) {
      expect(categoryBySlug(slug)!.fields.find((f) => f.key === key)?.grants).toBe(true);
    }
  });
});

describe('calls for someone else', () => {
  it('tells the owner from someone else', () => {
    expect(isSomeoneElse('Nick Hughes', 'Nick Khami')).toBe(true);
    expect(isSomeoneElse(' nick  khami ', 'Nick Khami')).toBe(false);
    expect(isSomeoneElse(undefined, 'Nick Khami')).toBe(false);
    expect(isSomeoneElse('Nick Hughes', undefined)).toBe(false);
  });

  it("never fills a friend's call from the owner's profile", () => {
    const owner = { full_name: 'Nick Khami', address: '399 Arguello Blvd, San Francisco, CA', date_of_birth: '01/20/2002', phone: '7379832612' };
    const details = { patient_full_name: 'Nick Hughes', reason: 'routine eye exam' };
    const r = resolveIntake(medical, details, {});
    expect(r.known.map((k) => k.value).join(' ')).not.toContain('Arguello');
    expect(r.missing.map((f) => f.key)).toContain('patient_date_of_birth');
    expect(resolveIntake(medical, details, owner).known.map((k) => k.value).join(' ')).toContain('Arguello');
    const msg = missingMessage(medical, r, 'Nick Hughes');
    expect(msg).toContain("ask for Nick Hughes's own details");
    expect(msg).not.toContain('callbay_save_profile');
  });
});
