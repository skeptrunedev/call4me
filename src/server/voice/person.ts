import type { TranscriptLine } from '../services/call-store';

/**
 * Patching the person (call4me's user) into a live call. Their phone is rung as a listen-only
 * supervisor. Ringing to join, they are put on the call the moment they pick up: Telnyx refuses
 * to play a prompt on a supervisor leg, so nothing could tell them to press a key, and people
 * talked into a call nobody heard. Once they're on, the caller keeps working with them on the
 * line. In listen mode they stay listen-only for as long as they like and the caller carries on.
 * A ring to join that ends unanswered is settled for the call: the caller is told they can't be
 * reached, and doesn't ring again on its own.
 */

/**
 * 'join': ring them onto the call, where the other side hears them as soon as they answer (a
 * voicemail answering is patched in too; that's accepted). 'listen': ring them to listen in for as
 * long as they like; they can press 1 anytime to join. Either way the caller keeps working.
 */
export type PersonMode = 'join' | 'listen';

/** Whether the caller holds back (no forced hand-offs) for the person's leg: ringing to join, or on the call. */
export function callerHoldsFor(leg: { ringing: boolean; on: boolean; mode: PersonMode }): boolean {
  return leg.on || (leg.ringing && leg.mode === 'join');
}

/**
 * What the person's leg ending means for the caller: they left the call, a ring to join went
 * unanswered (or voicemail), or they just stopped listening, which the caller needn't hear about.
 */
export function legEnded(mode: PersonMode, wasOn: boolean): 'left' | 'unreachable' | 'stopped-listening' {
  if (wasOn) return 'left';
  return mode === 'listen' ? 'stopped-listening' : 'unreachable';
}

/** What connect_person returns while they're already listening: they join by pressing 1. */
export function listeningMessage(owner: string): string {
  return `${owner} is listening in on this call. If they press 1 they join it and the other side hears them too. Either way, keep handling it yourself.`;
}

/**
 * What the caller is told when the person comes on the call. It used to go silent here, so people
 * who joined heard only the business and took the caller for gone. It keeps working instead, but
 * never hangs up on them.
 */
export function joinedMessage(owner: string): string {
  return `${owner} has joined the call. ${owner}, you and the other side can all hear each other now. Keep working on the task as before. When ${owner} speaks, let them finish, and follow their lead if they answer something or tell you what to do. Don't hang up while ${owner} is on the call: they hang up when they're done.`;
}

export function leftMessage(owner: string): string {
  return `${owner} has left the call. Keep working on the task. If it's already done, say bye and hand off to hang up.`;
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
