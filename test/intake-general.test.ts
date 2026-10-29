import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog, categoryBySlug, resolveIntake, savedContext } from '../src/server/services/intake';

const profile = {
  full_name: 'David Aviles',
  date_of_birth: '1990-03-14',
  address: '1 Main St, Oakland, CA 94601',
  email: 'david@example.com',
  insurance_member_id: 'K123456',
  accent: 'Scottish',
  answering_instructions: 'take a message',
};

test("an owner's call carries the rest of their saved profile, beyond what its category asks for", () => {
  // David's Kaiser billing call went out as general, and the rep wanted his date of birth.
  const general = categoryBySlug('general')!;
  const intake = resolveIntake(general, { questions: 'is the Oct 31 autopay still scheduled?' }, profile);
  const extra = Object.fromEntries(savedContext(profile, catalog('agents').profileKeys, intake).map((k) => [k.key, k.value]));
  assert.equal(extra.date_of_birth, '1990-03-14');
  assert.equal(extra.address, '1 Main St, Oakland, CA 94601');
  assert.equal(extra.email, 'david@example.com');
  assert.equal(extra.insurance_member_id, 'K123456');
  assert.equal(extra.full_name, undefined, 'already in the brief from the category');
  assert.equal(extra.accent, undefined, 'how the caller speaks is not a fact');
  assert.equal(extra.answering_instructions, undefined);
});

test('a field the category already filled, under its own name, is not repeated', () => {
  const medical = categoryBySlug('medical')!;
  const intake = resolveIntake(medical, { reason: 'checkup', availability: 'any weekday', insurance_carrier: 'Kaiser', phone: '9255550100' }, profile);
  const extra = savedContext(profile, catalog('agents').profileKeys, intake).map((k) => k.key);
  assert.ok(!extra.includes('date_of_birth'), 'taken as patient_date_of_birth');
});

test('surfaces that forbid restricted data never get it from the profile', () => {
  const general = categoryBySlug('general')!;
  const intake = resolveIntake(general, { questions: 'hours?' }, profile);
  const extra = savedContext(profile, catalog('chatgpt').profileKeys, intake).map((k) => k.key);
  assert.ok(!extra.includes('insurance_member_id'));
  assert.ok(extra.includes('date_of_birth'));
});
