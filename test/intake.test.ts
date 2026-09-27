import { describe, expect, it } from 'vitest';
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
