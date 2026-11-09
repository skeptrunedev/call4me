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
