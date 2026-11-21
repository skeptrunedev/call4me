import assert from 'node:assert/strict';
import test from 'node:test';

// Anton's karting call (call_puk383rbro4t5hzx, 2026-11-21) asked prices "like a regular customer",
// and the caller answered the track's own questions with made-up details: first visit, experienced,
// an adult, one person. His test call before it asked a dog's name six times without once asking
// to spell it, after hearing "Laplas" as "¿hablas?".
const call = {
  owner: 'Alex Kim', assistantName: null, callingAs: null, onBehalfOf: 'Alex Kim', business: 'Example Karting',
  goal: 'Ask like a regular customer would what a 10 minute session costs.',
  facts: '', flexibility: '', callbackNumber: '+14155550100', callbackRingsOwner: false, connectWhen: null, voice: 'marin',
  localTime: null, today: 'Saturday, November 21, 2026',
} as const;

test('questions about the person are answered only from the facts, even calling as a regular customer', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  assert.match(callInstructions(call), /whether it's their first time, how experienced they are, their age, how many people are coming\. Even when you're asking like a regular customer, answer these only from the facts above\. Otherwise say you'll check \(ask_user\)/);
});

test('a name the caller still cannot make out gets spelled, not asked for again', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  assert.match(callInstructions(call), /A name you didn't catch: ask them to say it again once\. If it still sounds odd or like an everyday word, ask them to spell it/);
});
