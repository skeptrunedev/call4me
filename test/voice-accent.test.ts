import assert from 'node:assert/strict';
import test from 'node:test';
import { callInstructions, type CallBrief } from '../src/server/voice/prompt';
import { VOICE_SAMPLES } from '../src/content/voices';

const brief: CallBrief = { onBehalfOf: 'Alex', owner: 'Alex', assistantName: null, callingAs: null, business: 'Nopa', goal: 'Book a table.', facts: '', flexibility: '', callbackNumber: '+14155550100', callbackRingsOwner: false, localTime: null, connectWhen: null, voice: 'marin' };

test('voices documented with a regional accent are told to keep it on the call', () => {
  assert.match(callInstructions({ ...brief, voice: 'willow' }), /Speak in your natural Irish accent for the whole call/);
  assert.match(callInstructions({ ...brief, voice: 'vesper' }), /Speak in your natural British accent for the whole call/);
});

test('voices without a documented accent get no accent rule', () => {
  for (const voice of ['marin', 'cedar', 'gleam', 'meridian'] as const) assert.doesNotMatch(callInstructions({ ...brief, voice }), /natural .* accent/);
});

test('the voices page labels the same accents the call prompt holds', () => {
  const byVoice = Object.fromEntries(VOICE_SAMPLES.map((s) => [s.voice, s.accent]));
  assert.equal(byVoice.willow, 'Irish');
  assert.equal(byVoice.vesper, 'British');
  assert.equal(byVoice.marin, null);
});
