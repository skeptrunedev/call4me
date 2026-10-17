import assert from 'node:assert/strict';
import test from 'node:test';
import { midConversation, TALK_RECENT_MS } from '../src/server/voice/time-limit';

const now = 1_800_000_000_000;

test('both sides talking just now is a conversation the hard stop must not cut off', () => {
  // Thai Airways, Oct 17: the agent was mid-answer when the 30 minute cap hung up on her.
  assert.ok(midConversation({ theirsAt: now - 2_000, oursAt: now - 9_000, personOn: false, now }));
});

test('a menu, a recording or voicemail is not: our caller has been silent', () => {
  assert.ok(!midConversation({ theirsAt: now - 1_000, oursAt: now - TALK_RECENT_MS - 1, personOn: false, now }));
  assert.ok(!midConversation({ theirsAt: now - 1_000, oursAt: 0, personOn: false, now }));
});

test('a quiet line is not, whoever spoke last', () => {
  assert.ok(!midConversation({ theirsAt: now - TALK_RECENT_MS - 1, oursAt: now - 1_000, personOn: false, now }));
  assert.ok(!midConversation({ theirsAt: 0, oursAt: 0, personOn: false, now }));
});

test('with the user patched in, the business talking is enough: the caller stays quiet for them', () => {
  assert.ok(midConversation({ theirsAt: now - 3_000, oursAt: 0, personOn: true, now }));
  assert.ok(!midConversation({ theirsAt: now - TALK_RECENT_MS - 1, oursAt: 0, personOn: true, now }));
});
