import type { TranscriptLine } from '../services/calls';

/**
 * Patching the person (callbay's user) into a live call. Their phone is rung as a listen-only
 * supervisor and a voicemail answers like a person does, so they only join after pressing 1.
 * A ring that ends without that is settled for the call: the caller is told they can't be
 * reached, and doesn't ring again on its own (it used to, patching voicemail in each time).
 */

/** The join prompt's call.gather.ended: only a pressed 1 puts them on the call. */
export function pressedToJoin(status: string | undefined, digits: string | undefined): boolean {
  return status === 'valid' && digits === '1';
}

export function unreachableMessage(owner: string): string {
  return `${owner} couldn't be reached (no answer, or their voicemail picked up). Don't try to connect them again on this call. Tell them ${owner} isn't available right now and ask whether they can call ${owner} back, or carry on with whatever you can do without them.`;
}

export function alreadyUnreachable(owner: string): string {
  return `${owner} couldn't be reached a moment ago, so don't ring again on this call. ${unreachableMessage(owner)}`;
}

/**
 * The transcript to store: what is already stored, then what this session instance has heard
 * since. A session instance that restarts mid-call (a deploy) starts with an empty transcript,
 * and writing that alone erased everything said before it.
 */
export function mergeTranscript(stored: TranscriptLine[], local: TranscriptLine[]): TranscriptLine[] {
  const last = stored.length ? stored[stored.length - 1].at : -Infinity;
  return [...stored, ...local.filter((l) => l.at > last)];
}
