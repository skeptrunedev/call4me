import assert from 'node:assert/strict';
import test from 'node:test';

// Kaiser's scheduler asked for the patient's first name and heard "Arnaud" spelled "A R N O W",
// twice (call_a990p1gvwk20uolv): the voice model spells a name from how it sounds.
const call = {
  owner: 'Arnaud Y Auger', assistantName: null, callingAs: null, onBehalfOf: 'Arnaud Y Auger', business: 'Kaiser Permanente',
  goal: 'Book the earliest afternoon primary care appointment.', facts: '', flexibility: '', callbackNumber: '+14155550100',
  callbackRingsOwner: false, connectWhen: null, voice: 'marin', localTime: null, today: 'Friday, November 27, 2026',
} as const;

test('the name a call is for comes pre-spelled, with read-backs checked against it', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  const prompt = callInstructions(call);
  assert.match(prompt, /When you spell a name, read exactly these letters in this order\. Never spell one from memory or from how it sounds:\n- Arnaud Y Auger: A-R-N-A-U-D, then Y, then A-U-G-E-R\n/);
  assert.match(prompt, /When they read a name back, check it letter by letter against these\./);
  assert.equal(prompt.match(/- Arnaud Y Auger:/g)?.length, 1, 'the owner and who the call is for are one name, spelled once');
});

test('name fields among the facts are spelled as written, every name in a list, punctuation named', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  const prompt = callInstructions({
    ...call,
    onBehalfOf: "my boss Priya",
    facts: "patient's full name: maría o'brien-diaz\npassenger names exactly as on ID: Ana Diaz, Luis Diaz\nparty size: 4",
  });
  assert.match(prompt, /- Priya: P-R-I-Y-A\n/, 'only the name in "my boss Priya"');
  assert.doesNotMatch(prompt, /- my boss/);
  assert.match(prompt, /- maría o'brien-diaz: M-A-R-Í-A, then O, apostrophe, B-R-I-E-N, dash, D-I-A-Z\n/);
  assert.match(prompt, /- Ana Diaz: A-N-A, then D-I-A-Z\n- Luis Diaz: L-U-I-S, then D-I-A-Z\n/);
  assert.doesNotMatch(prompt, /- 4:/);
});

test('a call with no name to spell gets no name block', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  assert.doesNotMatch(callInstructions({ ...call, owner: 'sadboy', onBehalfOf: 'sadboy' }), /When you spell a name/);
});
