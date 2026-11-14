import assert from 'node:assert/strict';
import test from 'node:test';
import { MenuRecovery } from '../src/server/voice/handoff';

// Structure Properties, 2026-11-09: 4 went in mid-menu, and the rest of that same recording, transcribed
// a second or two later, read as a fresh menu: the back office was started again and pressed 4 again.
const MENU = "Thank you for calling Structure Properties. For maintenance, press 1, to reach your property manager, press 2. To hear about our vacant apartments, press 4.";
const TAIL = ' For questions about your rent payments, press 5.';

test('the rest of a menu transcribed just after a key press is not a new menu', () => {
  const m = new MenuRecovery();
  m.observe(MENU, 1_000);
  const snap = m.snapshot();
  m.submitted('4', snap, 1_100);
  m.observe(TAIL, 2_600);
  assert.equal(m.pending(), null, 'the trailing options were spoken before the key went in');
  assert.equal(m.repeats('4'), true, 'pressing 4 again would land in the next menu');
});

test('a menu that answers the key later is still a new menu', () => {
  const m = new MenuRecovery();
  m.observe(MENU, 1_000);
  m.submitted('4', m.snapshot(), 1_100);
  m.observe(' Vacancies. For studios, press 1. For one bedrooms, press 2.', 6_000);
  assert.notEqual(m.pending(), null);
  assert.equal(m.repeats('4'), false);
});

// Shaped like Beatrix Fulton Market's party line (2026-11-13, business renamed): the recording's own
// controls read as a menu waiting on a key, and kept the caller off the line while it recorded.
const GREETING = "You have reached Harbor Parties. Please leave your name, number, and a brief description of the event you are looking to plan and we will get back to you as soon as possible. Thank you. Record your message at the tone. Press any key or stop talking to end the recording";

test("a voicemail's recording controls are not a menu waiting on a key", () => {
  const m = new MenuRecovery();
  m.observe('Harbor Market. For reservations, please dial one. For group dining and special events, please dial two.', 1_000);
  assert.notEqual(m.pending(), null);
  m.submitted('2', m.snapshot(), 1_100);
  m.observe(` ${GREETING}`, 20_000);
  assert.equal(m.awaitingKey(), false, 'the caller is heard while the voicemail records');
  assert.equal(m.pending(), null);
  for (const greeting of [
    'At the tone, please record your message. When you have finished recording, you may hang up or press one for more options.',
    'Please leave a message after the beep. When you are finished, press pound.',
    // Zack's carrier voicemail, 2026-11-14: the control is the sentence before the key.
    'Nothing has been recorded. Record your message after the tone .Simply hang up when done. Or for delivery options, press the pound sign',
  ]) {
    const vm = new MenuRecovery();
    vm.observe(greeting, 1_000);
    assert.equal(vm.awaitingKey(), false, greeting);
  }
});

test("a voicemail's review menu, and a real option after a voicemail prompt, still wait on a key", () => {
  const review = new MenuRecovery();
  review.observe(`${GREETING} To save this recording, press one. To listen, press two. To rerecord, press three.`, 1_000);
  assert.equal(review.awaitingKey(), true);
  const operator = new MenuRecovery();
  operator.observe('Please leave a message after the tone, or press 0 for the operator.', 1_000);
  assert.equal(operator.awaitingKey(), true);
});

test("a queue recording describing a later keypad step is not a menu", () => {
  // New Jersey E-ZPass, replayed every 3.5 minutes on hold: each replay started the back office,
  // and our caller said "still on hold" into the queue, which ended the hold early.
  const queue = new MenuRecovery();
  queue.observe('Please hold, and your call will be answered in the order it was received. You will never be asked to provide your credit card or bank information verbally. You will be able to enter it securely from your telephone keypad. New Jersey E-ZPass urges customers to be cautious.', 1_000);
  assert.equal(queue.pending(), null);
  for (const prompt of ['Please enter your account number using your telephone keypad.', 'Using your keypad, type your zip code followed by the pound key.']) {
    const m = new MenuRecovery();
    m.observe(prompt, 1_000);
    assert.notEqual(m.pending(), null, prompt);
  }
});
