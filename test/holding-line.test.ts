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
