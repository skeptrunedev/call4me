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

test("their closing after our goodbye, thanking us for calling, still hangs up", async () => {
  const { missedHandoff } = await import('../src/server/voice/handoff');
  const t = 1_000_000;
  const lines = [
    { role: 'them' as const, text: "Oh, okay, yeah. He's scheduled for ...February seventeenth, Wednesday", at: t },
    { role: 'caller' as const, text: 'Great. Thank you so much for your help.', at: t + 6000 },
    { role: 'them' as const, text: '[gasp', at: t + 8000 },
    { role: 'caller' as const, text: 'Okay, bye!', at: t + 9000 },
    { role: 'them' as const, text: "Yeah, you're welcome. Thank you for calling Penn State Health", at: t + 11000 },
  ];
  assert.equal(missedHandoff(lines, 0, new Set())?.reason, 'promise');
  // A question after our goodbye is not a closing.
  assert.equal(missedHandoff([...lines.slice(0, 4), { role: 'them' as const, text: 'Yeah, wait, what was his date of birth again?', at: t + 11000 }], 0, new Set()), null);
});
