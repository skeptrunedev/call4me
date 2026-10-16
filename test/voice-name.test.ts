import assert from 'node:assert/strict';
import test from 'node:test';
import { namePronunciationOf } from '../src/server/services/intake';
import { profiles } from '../src/server/services/profiles';
import { callInstructions, inboundInstructions, type CallBrief } from '../src/server/voice/prompt';
import { d1 } from './sqlite-d1';

const brief: CallBrief = { onBehalfOf: 'Amir Tarighat', owner: 'Amir Tarighat', assistantName: null, callingAs: null, business: 'Nopa', goal: 'Book a table.', facts: '', flexibility: '', callbackNumber: '+14155550100', callbackRingsOwner: false, localTime: null, connectWhen: null, voice: 'marin' };
const rule = /Every time you say Amir Tarighat's name, pronounce it exactly like this: ah-MEER tah-ree-GAHT\. Never guess at it\./;

test("the owner's saved pronunciation goes into every call, made or answered", () => {
  assert.match(callInstructions({ ...brief, ownerPronunciation: 'ah-MEER tah-ree-GAHT' }), rule);
  assert.match(callInstructions({ ...brief, assistantName: 'Sam', ownerPronunciation: 'ah-MEER tah-ree-GAHT' }), rule);
  assert.match(inboundInstructions({ owner: 'Amir Tarighat', assistantName: null, callingAs: null, ownerPronunciation: 'ah-MEER tah-ree-GAHT', callbackNumber: '+14155550100', tasks: [], likely: false, recent: [], localTime: null }), rule);
});

test('without a saved pronunciation the name is said as written', () => {
  assert.doesNotMatch(callInstructions(brief), /pronounce it/);
  assert.doesNotMatch(callInstructions({ ...brief, ownerPronunciation: null }), /pronounce it/);
});

test('name pronunciation saves on the profile like any other field, and blank means none', async () => {
  const db = d1();
  const saved = await profiles(db).update('acct_alice', { full_name: 'Amir Tarighat', name_pronunciation: 'ah-MEER tah-ree-GAHT' });
  assert.equal(namePronunciationOf(saved), 'ah-MEER tah-ree-GAHT');
  assert.equal(namePronunciationOf({ name_pronunciation: '  ' }), null);
});
