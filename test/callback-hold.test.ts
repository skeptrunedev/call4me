import assert from 'node:assert/strict';
import test from 'node:test';
import { callbackMinutes } from '../src/server/services/dialer';

test("a callback holds an outbound call's default minutes, not the whole balance", () => {
  // Raghav's $50 top-up: one callback held 170 minutes of it while his agent kept placing calls.
  assert.equal(callbackMinutes(4262, 25), 30);
});

test('a small balance holds what it covers', () => {
  assert.equal(callbackMinutes(250, 25), 10);
  assert.equal(callbackMinutes(20, 25), 0);
});
