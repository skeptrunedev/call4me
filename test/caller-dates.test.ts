import assert from 'node:assert/strict';
import test from 'node:test';

// A call placed without the business's time zone told the caller no date at all, and it turned
// an October 7-15 rental into "last July" on November 12.
const call = {
  owner: 'Alex Kim', assistantName: null, callingAs: null, onBehalfOf: 'Alex Kim', business: 'Example Rent A Car',
  goal: 'He rented a car here October 7 to 15, 2026. Ask them to email the rental agreement.',
  facts: '', flexibility: '', callbackNumber: '+14155550100', callbackRingsOwner: false, connectWhen: null, voice: 'marin',
} as const;

test('the caller always knows the date, and says when it may be a day off for the business', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  const unknown = callInstructions({ ...call, localTime: null, today: 'Thursday, November 12, 2026' });
  assert.match(unknown, /Today is Thursday, November 12, 2026 in UTC\. Their time zone isn't known, so for them it may still be the day before or already the next day\./);
  const known = callInstructions({ ...call, localTime: 'Thursday, November 12, 2026, 12:17 PM', today: 'Thursday, November 12, 2026' });
  assert.match(known, /It's Thursday, November 12, 2026, 12:17 PM for them right now\./);
  assert.doesNotMatch(known, /in UTC/);
});

test('the caller says dates the way the task gives them, not as relative dates it works out', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  assert.match(callInstructions({ ...call, localTime: null, today: 'Thursday, November 12, 2026' }), /never as "last July", "next week" or "a few days ago"/);
});

test('an answered call is told the date too', async () => {
  const { inboundInstructions } = await import('../src/server/voice/prompt');
  const brief = { owner: 'Alex', assistantName: null, callingAs: null, callbackNumber: '+14155550100', tasks: [], likely: false, recent: [], standing: null };
  assert.match(inboundInstructions({ ...brief, localTime: null, today: 'Thursday, November 12, 2026' }), /Today is Thursday, November 12, 2026 in UTC\./);
  assert.match(inboundInstructions({ ...brief, localTime: 'Thursday, November 12, 2026, 4:40 PM', today: 'Thursday, November 12, 2026' }), /It's Thursday, November 12, 2026, 4:40 PM right now\./);
});

test("today's date is the UTC date", async () => {
  const { todayUtc } = await import('../src/server/services/calls');
  assert.equal(todayUtc(new Date(Date.UTC(2026, 10, 12, 23, 30))), 'Thursday, November 12, 2026');
  assert.equal(todayUtc(new Date(Date.UTC(2026, 10, 13, 0, 30))), 'Friday, November 13, 2026');
});
