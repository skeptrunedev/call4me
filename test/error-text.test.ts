import assert from 'node:assert/strict';
import test from 'node:test';
import { errorText } from '../src/server/lib/errors';

test('a logged error keeps what went wrong, not only where: name, message and cause ahead of the stack', () => {
  // A D1 failure in save_profile logged only its stack frames, so nobody could tell what D1 refused.
  const d1 = new Error('D1_ERROR: Network connection lost.', { cause: new Error('Network connection lost.') });
  const text = errorText(d1);
  const lines = text.split('\n');
  assert.equal(lines[0], 'Error: D1_ERROR: Network connection lost.');
  assert.equal(lines[1], 'caused by Error: Network connection lost.');
  assert.ok(lines.length > 2 && lines.slice(2).every((l) => /^\s+at /.test(l)), text);
  assert.equal(text.match(/D1_ERROR/g)?.length, 1, 'the message is not repeated from the stack header');

  class CallError extends Error {
    name = 'CallError';
  }
  assert.match(errorText(new CallError('voice is locked for a deploy')), /^CallError: voice is locked for a deploy\n/);
  assert.equal(errorText('carrier said no'), 'carrier said no');
  assert.equal(errorText(new Error('outer', { cause: 'a string cause' })).split('\n')[1], 'caused by a string cause');
});
