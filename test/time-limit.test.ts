import assert from 'node:assert/strict';
import test from 'node:test';
import { midConversation } from '../src/server/voice/time-limit';

const s = (n: number) => 1_800_000_000_000 + n * 1000;

test('both sides spoke just now: still talking', () => {
  assert.equal(midConversation({ theirsAt: s(880), oursAt: s(885), personOn: false, now: s(896) }), true);
});

test('a rep quietly looking up what we just gave them is still mid-conversation', () => {
  // Raghav's T-Mobile call: the rep read his number back at 835s, he corrected it at 840s, and the
  // hard stop came at 896s while she checked it.
  assert.equal(midConversation({ theirsAt: s(835), oursAt: s(840), personOn: false, now: s(896) }), true);
});

test('they spoke last and went quiet: not waiting on them', () => {
  assert.equal(midConversation({ theirsAt: s(840), oursAt: s(835), personOn: false, now: s(896) }), false);
});

test('a long silence after our answer ends it', () => {
  assert.equal(midConversation({ theirsAt: s(700), oursAt: s(705), personOn: false, now: s(896) }), false);
});

test('patched in, the user talking with them counts', () => {
  assert.equal(midConversation({ theirsAt: s(890), oursAt: 0, personOn: true, now: s(896) }), true);
});
