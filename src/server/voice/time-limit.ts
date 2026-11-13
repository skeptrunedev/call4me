/**
 * Whether the hard stop would cut off a live conversation. A call that reaches its time limit while
 * the business is still talking with us gets a little more time to finish, the way a call on hold
 * keeps waiting, instead of hanging up mid-sentence. A phone menu, a recording or voicemail never
 * counts: the caller stays silent for those. One the user is on always counts.
 */

/** Both sides spoke at most this long before the hard stop. */
const TALK_RECENT_MS = 30_000;

/**
 * How long either side may go quiet, looking something up, before the call counts as over. Raghav Pillai's T-Mobile rep was checking his number 55s after he gave it when the
 * hard stop hung up on her, after an 8-minute hold.
 */
const LOOKUP_QUIET_MS = 120_000;

/**
 * How long after their last word our answer may end and still be what they are looking up. Their
 * lookup starts when we finish asking: Lidl Antwerpen's employee went to check after our 20-second,
 * three-part question and was hung up on 118s after it ended, 140s after their own last word.
 * Anything we say later is the caller talking into the quiet ("are you still there?"), which
 * doesn't restart their lookup.
 */
const ANSWER_MS = 45_000;

/** `oursAt` is when our speech last ended, `theirsAt` when they last spoke. */
export function midConversation(o: { theirsAt: number; oursAt: number; personOn: boolean; now: number }): boolean {
  const within = (at: number, ms: number) => at > 0 && o.now - at < ms;
  // The user on the call is in the conversation themselves, and hangs up when they're done. Blake
  // Dixon was cut off mid-booking with Chase Travel when the advisor went quiet at the hard stop.
  if (o.personOn) return true;
  // They just spoke and we were talking with them recently: they may be waiting on our answer while
  // we wait on the user (Jeremy's SONIFI rep asked which device he casts from, 22s before the hard
  // stop, 30s after our "still waiting on Jeremy").
  if (within(o.theirsAt, TALK_RECENT_MS) && within(o.oursAt, LOOKUP_QUIET_MS)) return true;
  // We spoke last, answering them: they're working on it, and the next word is theirs.
  if (o.oursAt <= o.theirsAt) return false;
  return within(o.oursAt - o.theirsAt <= ANSWER_MS ? o.oursAt : o.theirsAt, LOOKUP_QUIET_MS);
}
