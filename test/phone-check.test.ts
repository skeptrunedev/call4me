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

test('911 tells the agent to have the user dial it, and other N11 codes point to the full number', () => {
  const reason = (n: string) => { const c = checkDialable(n); return c.ok ? '' : c.reason; };
  assert.match(reason('911'), /tell the user to dial 911 themselves now/);
  for (const n of ['311', '411', '211']) assert.match(reason(n), /call the service's full 10-digit number instead/, n);
});

test("a bank's shared-cost line abroad is refused with a pointer to its number for callers overseas", () => {
  // An Australian asking their AI to call their bank gets its 13 or 1300 line, which can't be called.
  for (const n of ['+61 13 22 21', '+61 1300 650 500', '+33 8 10 00 00 00']) {
    const check = checkDialable(n);
    assert.equal(check.ok, false, n);
    assert.match(check.ok ? '' : check.reason, /number it lists for calling from overseas/, n);
  }
  assert.equal(checkDialable('+61 2 9999 3283').ok, true);
});
