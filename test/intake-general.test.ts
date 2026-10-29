import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryBySlug, resolveIntake } from '../src/server/services/intake';

test('a general call carries the saved date of birth, address and email for identity checks, and never requires them', () => {
  const general = categoryBySlug('general')!;
  const saved = resolveIntake(general, { questions: 'is the Oct 31 autopay still scheduled?' }, { full_name: 'David Aviles', date_of_birth: '1990-03-14', address: '1 Main St, Oakland, CA 94601', email: 'david@example.com' });
  assert.deepEqual(saved.missing, []);
  const known = Object.fromEntries(saved.known.map((k) => [k.key, k.value]));
  assert.equal(known.date_of_birth, '1990-03-14');
  assert.equal(known.address, '1 Main St, Oakland, CA 94601');
  assert.equal(known.email, 'david@example.com');

  const bare = resolveIntake(general, { questions: 'what are your hours?' }, {});
  assert.deepEqual(bare.missing, []);
  assert.deepEqual(bare.known.map((k) => k.key), ['questions']);
});
