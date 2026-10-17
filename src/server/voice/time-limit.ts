/**
 * Whether the hard stop would cut off a live conversation. A call that reaches its time limit while
 * the business is still talking with us (or with the user, patched in) gets a little more time to
 * finish, the way a call on hold keeps waiting, instead of hanging up mid-sentence. A phone menu,
 * a recording or voicemail never counts: the caller stays silent for those.
 */

/** Both sides spoke at most this long before the hard stop. */
export const TALK_RECENT_MS = 30_000;

export function midConversation(o: { theirsAt: number; oursAt: number; personOn: boolean; now: number }): boolean {
  const recent = (at: number) => at > 0 && o.now - at < TALK_RECENT_MS;
  // Patched in, the user does the talking and the caller stays quiet.
  return recent(o.theirsAt) && (o.personOn || recent(o.oursAt));
}
