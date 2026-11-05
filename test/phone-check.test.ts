import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDialable } from '../src/server/lib/phone';

test('toll-free numbers with an N11 exchange can be called', () => {
  // Amit's agent was refused three times calling a bank's toll-free line.
  for (const n of ['1-800-411-1234', '(888) 311-2000', '+1 855 211 7000']) assert.equal(checkDialable(n).ok, true, n);
});

test('N11 service codes and geographic N11 exchanges are still refused', () => {
  for (const n of ['911', '311', '(501) 411-1234', '+1 911 555 1234']) assert.equal(checkDialable(n).ok, false, n);
});
