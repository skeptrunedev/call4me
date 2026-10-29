import assert from 'node:assert/strict';
import test from 'node:test';
import { asksForMessage } from '../src/server/voice/handoff';
import { HoldMeter } from '../src/server/voice/hold';

test('greetings asking for a name and phone number are voicemail prompts, menu options are not', () => {
  for (const greeting of [
    "Please leave your name and phone number and we'll return your call promptly.",
    'Leave your name and number after the tone.',
    'Please leave your name, number and a brief message.',
    'Leave us a message.',
    'Please leave your name and callback number.',
    'Leave a detailed message and we will call you back.',
  ]) assert.ok(asksForMessage(greeting), greeting);
  assert.ok(!asksForMessage('To leave a message, press 3.'));
  assert.ok(!asksForMessage('Please hold, your call is important to us.'));
});

test('a voicemail greeting that says the call is important ends the hold once it asks for a name and number', () => {
  // Green Roots Lawn Care's greeting, in the deltas it was heard in.
  const meter = new HoldMeter();
  const deltas = [
    'Thank you for calling Green Roots Lawn Care. ',
    'We provide professional lawn fertilization, weed control, and seasonal lawn revitalization. ',
    "We're currently assisting other clients, but your call is important to us. ",
    'Please leave your name and phone number ',
    "and we'll return your call promptly.",
  ];
  const changes = deltas.map((d, i) => meter.them(d, 1_000 + i * 2_000));
  assert.ok(changes.some((c) => c !== null), 'the hold started');
  assert.equal(meter.holding(), false, 'the request for a message ended it');
});
