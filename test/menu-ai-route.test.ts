import assert from 'node:assert/strict';
import test from 'node:test';

// Rich's call to Vodafone UK (Nov 26, 2026): after routing to PAC codes and cancellations the menu
// said it couldn't "support AI assistants or automated services through this channel" and offered
// "press 1 for a person, or 2 for an AI". The caller pressed 2 to stay honest, Vodafone said it
// couldn't continue, and the call ended with nothing done. A menu key is a route, not a claim to be
// a person, so the person's line wins whenever the menu splits people from its AI.
const placed = {
  owner: 'Rich', assistantName: null, callingAs: null, onBehalfOf: 'Rich', business: 'Vodafone UK',
  goal: 'Cancel the line and get a PAC code.', facts: '', flexibility: '', callbackNumber: '+14155550100',
  callbackRingsOwner: false, connectWhen: null, voice: 'marin', localTime: null, today: 'Thursday, November 26, 2026',
};

test('a placed caller takes the menu’s person line over its AI line', async () => {
  const { callInstructions, backOfficeInstructions } = await import('../src/server/voice/prompt');
  const rules = callInstructions(placed);
  assert.match(rules, /press the person's key, whichever number it was given, even though you're the AI/);
  assert.match(rules, /Take the AI key only when the menu offers no person at all/);
  assert.doesNotMatch(rules, /press the AI key/);
  const office = backOfficeInstructions(placed);
  assert.match(office, /press the person's key, whichever digit it is, even though the caller is the AI/);
  assert.match(office, /take the AI key only when no person is offered/);
});

test('the honesty rule does not send a menu to its AI line', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  const rules = callInstructions(placed);
  assert.match(rules, /A phone menu's key for a person is not that question either: take it even when the menu splits people from its AI/);
  assert.match(rules, /is a route rather than that question: press the person's key \(see phone menus\)/);
  // The honest answer to a person still stands.
  assert.match(rules, /don't deny it: say it lightly and keep going, e.g. "Ha, yeah, I'm an AI assistant working for Rich,"/);
});

test('a menu recovery hands the back office the same person-first route', async () => {
  const { forcedHandoffMessage } = await import('../src/server/voice/handoff');
  const miss = {
    reason: 'menu_recovery' as const,
    line: { role: 'them' as const, text: 'Press 1 to speak to a person, or press 2 to talk to our AI assistant.', at: 1 },
  };
  const message = forcedHandoffMessage(miss, [miss.line]);
  assert.match(message, /when the menu offers a person's line beside its AI assistant or automated-service line, press the person's key whichever digit it is/);
});
