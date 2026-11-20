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
 * never hangs up on them, and leaves questions for the person to them: Vidéotron asked the account
 * holder for his date of birth, and the caller said it over him, mishearing the month, then insisted
 * on its version twice. Two people giving two birthdays failed the identity check and the account
 * holder was sent to a store (call_bai3hadrpqh08a9r, 2026-11-20).
 */
export function joinedMessage(owner: string): string {
  return `${owner} has joined the call. ${owner}, you and the other side can all hear each other now. Keep working on the task as before. When ${owner} speaks, let them finish, and follow their lead if they answer something or tell you what to do. Questions for ${owner} themselves, like their date of birth, a security answer or their consent, are theirs to answer: stay quiet while they do, and never answer for them or repeat what they said, even if you heard it. Don't hang up while ${owner} is on the call: they hang up when they're done.`;
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

/** One message of a voice session's startup history (session.start's `input`). */
export type LiveInput = { type: 'message'; role: 'developer' | 'user' | 'assistant'; content: [{ type: 'input_text' | 'output_text'; text: string }] };

/**
 * GPT-Live takes at most 128 messages and 8,192 tokens of startup history, and refuses the whole
 * session over either. There's no tokenizer here: the history stays at 6,000 by an estimate
 * (tokens), which leaves room where the estimate runs low.
 */
const RESUME_MESSAGES = 128;
const RESUME_TOKENS = 6_000;
/** A message's rendering on top of its text. */
const MESSAGE_TOKENS = 4;
/** A call's first lines say how it got where it is: the menu path, and facts like a confirmation code. */
const RESUME_FIRST_LINES = 6;
/**
 * No one line takes more. Our caller stays silent on hold, so every repeat of the queue's recording
 * runs into one line of theirs, and after an hour on hold that line is the hour; its end is where
 * the call is.
 */
const RESUME_LINE_TOKENS = 400;
const RESUME_KEYS_TOKENS = 400;

/**
 * A token for every four letters of a word (with the space before it), and one for every other
 * character. Against GPT-Live's own count: a third high for English and French, two to four times
 * for Japanese, Chinese, Korean, Arabic and Hindi, and about right for a code spelled out ("K X 7
 * 4 Q 2"), a token a character with its spaces, which overran 8,192 when counted at four
 * characters a token. RESUME_TOKENS leaves the rest.
 */
export function tokens(text: string): number {
  let n = 0;
  for (const [run] of text.matchAll(/ ?[A-Za-z]+|[^A-Za-z]/gu)) n += /[A-Za-z]/.test(run) ? Math.ceil(run.trimStart().length / 4) : 1;
  return n;
}

/** The end of `text`, within `max` tokens. */
export function lastTokens(text: string, max: number): string {
  if (tokens(text) <= max) return text;
  const chars = [...text];
  // The shortest cut whose rest fits; a later start never costs more.
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens(`…${chars.slice(mid).join('')}`) <= max) hi = mid;
    else lo = mid + 1;
  }
  return `…${chars.slice(lo).join('')}`;
}

/** What a voice session that takes a call over mid-way is told about it (resumeInput). */
export interface CallSoFar {
  transcript: TranscriptLine[];
  /** When the business put us on hold, while it still has us waiting. */
  holdSince: number | null;
  /** The keys pressed so far (MenuRecovery.history). */
  keys: string;
  /** What the voice model was told along the way that still stands, word for word: a question that got no answer, the person on the call, the time running out. */
  standing: string[];
  now: number;
}

/**
 * The startup history for a voice session that takes a call over mid-way: a session lost with
 * its phone stream (detachLive), one replaced after a reset, and one that rolls over before
 * GPT-Live's session limit (maybeRollLive). The call's lines as the conversation (theirs as the
 * user's, our caller's as the assistant's, notes as the developer's), then a note on where the
 * call stands, so it carries on instead of greeting them again. A long call keeps its first lines
 * and as many of its latest as fit.
 */
export function resumeInput(c: CallSoFar): LiveInput[] {
  const message = (role: LiveInput['role'], text: string): LiveInput => ({ type: 'message', role, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }] });
  const lines = c.transcript
    .filter((l) => l.text.trim())
    .map((l) => message(l.role === 'them' ? 'user' : l.role === 'caller' ? 'assistant' : 'developer', lastTokens(`${l.role === 'note' ? 'note: ' : ''}${l.text.trim()}`, RESUME_LINE_TOKENS)));
  const minutes = c.holdSince === null ? 0 : Math.max(1, Math.round((c.now - c.holdSince) / 60_000));
  const note = message('developer', [
    "You are back on the SAME call, mid-conversation: the messages before this one are the call so far, and the assistant's lines are what you said. Do not greet them or introduce yourself again, and do not repeat what you already said. Carry on from where it left off; if they were in the middle of something, wait for them. If they ask, say the line cut out for a second.",
    c.holdSince === null ? '' : `They put you on hold ${minutes} minute${minutes === 1 ? '' : 's'} ago, and you are still waiting. Stay completely silent through hold music and recordings, and speak only once a person talks to you.`,
    `Keys pressed on this call so far:\n${lastTokens(c.keys, RESUME_KEYS_TOKENS)}`,
    ...c.standing,
  ].filter(Boolean).join('\n\n'));
  const cost = (m: LiveInput) => tokens(m.content[0].text) + MESSAGE_TOKENS;
  const leftOut = (n: number) => message('developer', `(${n} more lines of the call came here, left out for length.)`);
  // Room for the note, and for the marker where lines were left out.
  let budget = RESUME_TOKENS - cost(note) - cost(leftOut(lines.length));
  let slots = RESUME_MESSAGES - 2;
  const take = (m: LiveInput) => {
    if (!slots || cost(m) > budget) return false;
    budget -= cost(m);
    slots--;
    return true;
  };
  const first: LiveInput[] = [];
  for (const m of lines.slice(0, RESUME_FIRST_LINES)) {
    if (!take(m)) break;
    first.push(m);
  }
  const latest: LiveInput[] = [];
  for (let i = lines.length - 1; i >= first.length && take(lines[i]); i--) latest.unshift(lines[i]);
  const left = lines.length - first.length - latest.length;
  return [...first, ...(left ? [leftOut(left)] : []), ...latest, note];
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
