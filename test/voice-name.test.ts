import assert from 'node:assert/strict';
import test from 'node:test';
import { namePronunciationOf } from '../src/server/services/intake';
import { profiles } from '../src/server/services/profiles';
import { d1 } from './sqlite-d1';


test('name pronunciation saves on the profile like any other field, and blank means none', async () => {
  const db = d1();
  const saved = await profiles(db).update('acct_alice', { full_name: 'Amir Tarighat', name_pronunciation: 'ah-MEER tah-ree-GAHT' });
  assert.equal(namePronunciationOf(saved), 'ah-MEER tah-ree-GAHT');
  assert.equal(namePronunciationOf({ name_pronunciation: '  ' }), null);
});
