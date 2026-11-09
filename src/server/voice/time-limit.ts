/**
 * Whether the hard stop would cut off a live conversation. A call that reaches its time limit while
 * the business is still talking with us (or with the user, patched in) gets a little more time to
 * finish, the way a call on hold keeps waiting, instead of hanging up mid-sentence. A phone menu,
 * a recording or voicemail never counts: the caller stays silent for those.
 */

/** Both sides spoke at most this long before the hard stop. */
const TALK_RECENT_MS = 30_000;

/**
 * How long either side may go quiet, looking something up, before the call counts as over. Raghav Pillai's T-Mobile rep was checking his number 55s after he gave it when the
 * hard stop hung up on her, after an 8-minute hold.
 */
const LOOKUP_QUIET_MS = 120_000;

export function midConversation(o: { theirsAt: number; oursAt: number; personOn: boolean; now: number }): boolean {
  const within = (at: number, ms: number) => at > 0 && o.now - at < ms;
  // They just spoke and we were talking with them recently: they may be waiting on our answer while
  // we wait on the user (Jeremy's SONIFI rep asked which device he casts from, 22s before the hard
  // stop, 30s after our "still waiting on Jeremy"). Patched in, the user does the talking and the
  // caller stays quiet.
  if (within(o.theirsAt, TALK_RECENT_MS) && (o.personOn || within(o.oursAt, LOOKUP_QUIET_MS))) return true;
  // We spoke last, answering them: they're working on it, and the next word is theirs.
  return !o.personOn && within(o.theirsAt, LOOKUP_QUIET_MS) && o.oursAt > o.theirsAt;
}
