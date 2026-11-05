import assert from 'node:assert/strict';
import test from 'node:test';
import { answeringInstructionsOf } from '../src/server/services/intake';
import { profiles } from '../src/server/services/profiles';
import { inboundBackOfficeInstructions, inboundInstructions } from '../src/server/voice/prompt';
import { d1 } from './sqlite-d1';

const collect = 'Accept collect calls from jails and prisons by pressing 1, then take the inmate\'s name, facility and message.';
const brief = { owner: 'Stephanie', callbackNumber: '+14165550100', tasks: [], likely: false, recent: [], localTime: null };

test('answering instructions save on the profile, and blank means none', async () => {
  const saved = await profiles(d1()).update('acct_alice', { answering_instructions: collect });
  assert.equal(answeringInstructionsOf(saved), collect);
  assert.equal(answeringInstructionsOf({ answering_instructions: ' ' }), null);
});

test('answered calls carry the standing instructions to the answerer and its back office', () => {
  assert.match(inboundInstructions({ ...brief, standing: collect }), /# Standing instructions from the owner[\s\S]*collect calls from jails/);
  assert.match(inboundBackOfficeInstructions('Stephanie', [], collect), /needs no ask_user[\s\S]*collect calls from jails/);
  assert.doesNotMatch(inboundInstructions({ ...brief, standing: null }), /Standing instructions/);
  assert.doesNotMatch(inboundBackOfficeInstructions('Stephanie'), /standing instructions/);
});

test("the owner's saved opening wins over the callback's default greeting", () => {
  // Rubin's callback answered "Hi, this is a personal assistant checking for a customer", from his
  // last outbound call's calling_as, over the opening he had saved.
  const opening = 'Open: "Hello, you\'ve reached M. Rubin\'s assistant. Are you calling back about an inquiry we made?"';
  const withOpening = inboundInstructions({ ...brief, callingAs: 'a personal assistant checking for a customer', standing: opening });
  assert.match(withOpening, /Answer the way the standing instructions above say, word for word/);
  assert.doesNotMatch(withOpening, /- Answer with "Hi, this is a personal assistant/);
  assert.match(inboundInstructions({ ...brief, standing: null }), /- Answer with a simple "Hello\?"/);
});
