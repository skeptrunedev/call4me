import assert from 'node:assert/strict';
import test from 'node:test';
test('the holding line fits what the caller is waiting on and is said once', async () => {
  // Jeremy's SONIFI call: the rep waited on a QR rescan and heard "Is there another way to look it up?" twice.
  const { holdingLineMessage } = await import('../src/server/voice/handoff');
  const msg = holdingLineMessage('Try scanning the QR code on the TV again and tell me if it works', 'Jeremy');
  assert.match(msg, /still waiting on them/);
  assert.match(msg, /after you've said it, don't say it again/);
  assert.doesNotMatch(msg, /like "I don't have that detail yet/);
});

test("their closing after our goodbye, thanking us for calling, still hangs up", async () => {
  const { missedHandoff } = await import('../src/server/voice/handoff');
  const t = 1_000_000;
  const lines = [
    { role: 'them' as const, text: "Oh, okay, yeah. He's scheduled for ...February seventeenth, Wednesday", at: t },
    { role: 'caller' as const, text: 'Great. Thank you so much for your help.', at: t + 6000 },
    { role: 'them' as const, text: '[gasp', at: t + 8000 },
    { role: 'caller' as const, text: 'Okay, bye!', at: t + 9000 },
    { role: 'them' as const, text: "Yeah, you're welcome. Thank you for calling Penn State Health", at: t + 11000 },
  ];
  assert.equal(missedHandoff(lines, 0, new Set())?.reason, 'promise');
  // A question after our goodbye is not a closing.
  assert.equal(missedHandoff([...lines.slice(0, 4), { role: 'them' as const, text: 'Yeah, wait, what was his date of birth again?', at: t + 11000 }], 0, new Set()), null);
});

test('Greek goodbyes after our goodbye still hang up', async () => {
  const { missedHandoff } = await import('../src/server/voice/handoff');
  const t = 1_000_000;
  const said = (role: 'caller' | 'them', text: string, at: number) => ({ role, text, at: t + at });
  // A crew agency call sat silent for three minutes after this, to its time limit.
  const crew = [
    said('caller', 'Καλημέρα σας, είμαι η βοηθός του κ. Ραπακούλια και σας καλώ για τη βίζα του John.', 0),
    said('them', 'Ναι, θα το κοιτάξω και θα σας ενημερώσω.', 5000),
    said('caller', 'λεια. Ευχαριστώ πολύ.', 9000),
    said('them', 'Εντά', 9500),
    said('caller', ', να είστε', 10000),
    said('them', 'Ευχαρισ', 11000),
    said('caller', 'καλά κι', 11500),
    said('them', 'τώ, κι εγώ', 12000),
    said('caller', 'Γεια σας.', 13000),
    said('them', ', γεια γεια', 13500),
  ];
  assert.equal(missedHandoff(crew, 0, new Set())?.reason, 'promise');
  for (const text of ['Γεια σας', 'Γεια, γεια, γεια', 'Γεια σας, καλό βράδυ', 'Ευχαριστώ, κι εγώ', 'ευχαριστώ πάρα πολύ', "Να 'στε καλά",
    'Να είστε καλά. Καλή συνέχεια', 'Γεια σας. Ναι', 'Εντάξει, αντίο', 'Σας ευχαριστούμε πάρα πολύ']) {
    assert.equal(missedHandoff([...crew.slice(0, 9), said('them', text, 13500)], 0, new Set())?.reason, 'promise', text);
  }
  // Unambiguous goodbyes count wherever they fall in the caller's line.
  assert.equal(missedHandoff([...crew.slice(0, 2), said('caller', 'Τέλεια, ευχαριστώ! Καλή συνέχεια!', 9000)], 0, new Set())?.reason, 'promise');
  // A question after our goodbye is not a closing.
  assert.equal(missedHandoff([...crew.slice(0, 9), said('them', 'Γεια σας, μια ερώτηση ακόμα: ποιο είναι το τηλέφωνό σας;', 13500)], 0, new Set()), null);
  // An opening "Γεια σας!" answered "Γεια σας, παρακαλώ" is hello: the call has only begun.
  assert.equal(missedHandoff([said('caller', 'Γεια σας!', 0), said('them', 'Γεια σας, παρακαλώ', 1000)], 0, new Set()), null);
  assert.equal(missedHandoff([said('them', 'Παρακαλώ', 0), said('caller', 'Γεια σας!', 1000), said('them', 'Ναι', 2000)], 0, new Set()), null);
});

test('the caller never guesses he or she from the name of who it calls for', async () => {
  const { callInstructions, inboundInstructions } = await import('../src/server/voice/prompt');
  const call = {
    owner: 'Nikhil Dandavati', assistantName: null, callingAs: null, onBehalfOf: 'Nikhil Dandavati', business: 'Avis', goal: 'Move the pickup an hour later.',
    facts: '', flexibility: '', callbackNumber: '+14155550100', callbackRingsOwner: false, localTime: null, connectWhen: null, voice: 'marin',
  } as const;
  assert.match(callInstructions(call), /Never guess from Nikhil Dandavati's name whether they're a he or a she/);
  assert.match(inboundInstructions({ owner: 'Nikhil', assistantName: null, callingAs: null, callbackNumber: '+14155550100', tasks: [], likely: false, recent: [], localTime: null, standing: null }),
    /Never guess from Nikhil's name whether they're a he or a she/);
});

test('their goodbye split around ours still hangs up', async () => {
  const { missedHandoff } = await import('../src/server/voice/handoff');
  const t = 1_000_000;
  const said = (role: 'caller' | 'them', text: string, at: number) => ({ role, text, at: t + at });
  // Each of these left the line open after the goodbyes, 20s to 155s, until the other side or the user hung up.
  const endings: [string, string, string][] = [
    ['Mm-hm. Alright, thank you too. You have a good', 'Bye.', 'day Buh-bye'],
    ['Alright, thank', 'Bye.', 'you Uh-huh, bye-bye'],
    ['Okay', 'Yeah, thanks again. Bye!', 'Alright. [suck teeth] Uh-huh. Bye bye'],
  ];
  for (const [before, ours, after] of endings) {
    const lines = [said('them', 'The soonest is Friday at 8:20.', 0), said('them', before, 4000), said('caller', ours, 5000), said('them', after, 6000)];
    assert.equal(missedHandoff(lines, 0, new Set())?.reason, 'promise', after);
  }
  // Words after our goodbye that aren't a closing still get answered, not hung up on.
  const question = [said('them', 'You have a good', 4000), said('caller', 'Bye.', 5000), said('them', 'day, oh wait, what was the callback number?', 6000)];
  assert.equal(missedHandoff(question, 0, new Set()), null);
});
