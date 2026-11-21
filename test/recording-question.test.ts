import assert from 'node:assert/strict';
import test from 'node:test';

// Ben's test call (call_qvuut3qefqdn4uvb, 2026-11-21): asked "are you recording this?", the caller said
// "I don't make recordings or store audio". Placed calls are recorded by the outbound voice profile, and
// answered ones unless zero data retention is on, so the honest answer depends on which.
const placed = {
  owner: 'Alex Kim', assistantName: null, callingAs: null, onBehalfOf: 'Alex Kim', business: 'Example Kitchen',
  goal: 'Ask what time they open tomorrow.', facts: '', flexibility: '', callbackNumber: '+14155550100',
  callbackRingsOwner: false, connectWhen: null, voice: 'marin', localTime: null, today: 'Saturday, November 21, 2026',
} as const;
const answered = {
  owner: 'Alex Kim', assistantName: null, callingAs: null, callbackNumber: '+14155550100', tasks: [], likely: false,
  recent: [], localTime: null, today: 'Saturday, November 21, 2026', standing: null,
};

test('a placed call never denies being recorded', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  assert.match(callInstructions(placed), /# If they ask whether the call is recorded\nDon't bring it up yourself, but never deny it: the call is recorded for Alex Kim\./);
  assert.match(callInstructions({ ...placed, callingAs: 'Acme' }), /"Yeah, it's being recorded for Acme,"/);
});

test('an answered call says it is recorded only when it is', async () => {
  const { inboundInstructions } = await import('../src/server/voice/prompt');
  assert.match(inboundInstructions({ ...answered, recorded: true }), /Never deny it: "Yeah, it's being recorded for Alex Kim\."/);
  const zdr = inboundInstructions({ ...answered, recorded: false });
  assert.match(zdr, /It isn't: "No, it's not being recorded\."/);
  assert.doesNotMatch(zdr, /it's being recorded for/);
});
