import type { TranscriptLine } from '../services/calls';

/**
 * Patching the person (call4me's user) into a live call. Their phone is rung as a listen-only
 * supervisor and a voicemail answers like a person does, so they only join after pressing 1.
 * In listen mode they stay listen-only for as long as they like and the caller carries on.
 * A ring that ends without that is settled for the call: the caller is told they can't be
 * reached, and doesn't ring again on its own (it used to, patching voicemail in each time).
 */

/** How long an answered phone may listen without pressing 1 before it is taken for voicemail and hung up. */
export const JOIN_WAIT_MS = 30_000;

/**
 * 'join': ring them to take the call over; they press 1 within JOIN_WAIT_MS or the leg is hung up.
 * 'listen': ring them to listen in for as long as they like while the caller keeps working; they
 * can press 1 anytime to take over. (A voicemail could sit on a listening leg; that's accepted.)
 */
export type PersonMode = 'join' | 'listen';

/** How long an answered leg may go without pressing 1 before it is hung up; null keeps it. */
export function joinWaitMs(mode: PersonMode): number | null {
  return mode === 'join' ? JOIN_WAIT_MS : null;
}

/** Whether the caller holds back (no forced hand-offs) for the person's leg: ringing to join, or on the call. */
export function callerHoldsFor(leg: { ringing: boolean; on: boolean; mode: PersonMode }): boolean {
  return leg.on || (leg.ringing && leg.mode === 'join');
}

/**
 * What the person's leg ending means for the caller: they handed the call back, a ring to join
 * went unanswered (or voicemail), or they just stopped listening, which the caller needn't hear about.
 */
export function legEnded(mode: PersonMode, wasOn: boolean): 'handed-back' | 'unreachable' | 'stopped-listening' {
  if (wasOn) return 'handed-back';
  return mode === 'listen' ? 'stopped-listening' : 'unreachable';
}

/** What connect_person returns while they're already listening: they take over by pressing 1. */
export function listeningMessage(owner: string): string {
  return `${owner} is listening in on this call. They take over if they press 1; until then keep handling it yourself.`;
}

export function unreachableMessage(owner: string): string {
  return `${owner} couldn't be reached (no answer, or their voicemail picked up). Don't try to connect them again on this call. Tell them ${owner} isn't available right now and ask whether they can call ${owner} back, or carry on with whatever you can do without them.`;
}

export function alreadyUnreachable(owner: string): string {
  return `${owner} couldn't be reached a moment ago, so don't ring again on this call. ${unreachableMessage(owner)}`;
}

/**
 * What the voice model is told when a restarted session picks the call back up: the call so far,
 * so it carries on instead of greeting them again.
 */
export function resumeNote(transcript: TranscriptLine[]): string {
  const lines = transcript.slice(-40).map((l) => `${l.role === 'caller' ? 'you' : l.role === 'them' ? 'them' : 'note'}: ${l.text.trim()}`);
  return [
    'The audio dropped for a moment on our side and you are back on the SAME call, mid-conversation. Do not greet them or introduce yourself again, and do not repeat what you already said. Carry on from where it left off; if they were in the middle of something, wait for them. If they ask, say the line cut out for a second.',
    lines.length ? `The call so far:\n${lines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
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
