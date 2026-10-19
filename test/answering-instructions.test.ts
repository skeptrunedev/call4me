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
