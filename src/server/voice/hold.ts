/**
 * When the business has the caller waiting: put on hold, transferred, or queued behind "all our
 * representatives are busy". Hold time is billed at half price and lets a call run past its time
 * limit, so this errs toward staying on hold until a person is clearly back.
 *
 * A hold starts when the other side asks us to wait or plays a queue recording. It ends when
 * someone greets us ("my name is", "how can I help"), or when they say something that is
 * not a hold recording and our caller answers it, back-dated to when they started talking. Our
 * caller's own "sure, no problem" to "please hold" does not end it.
 */
import { asksUsToWait } from './handoff';

const QUEUE_RECORDING = /\b(?:please hold|on (?:a )?(?:(?:brief|short|quick|little|small) )?hold|(?:put|putting|place|placing) you on (?:a )?(?:\w+ )?hold|(?:let me|i'?ll|i will|i'?m going to|i'?m gonna|while i|as i|i'?m|i am) (?:connect|transfer)(?:ing)? you|stay on the line|remain on the line|(?:all )?(?:of )?our (?:agents|representatives|operators|associates|team members)(?: are)? (?:currently )?(?:busy|assisting|helping)|all (?:agents|representatives|operators|associates|lines) are (?:currently )?(?:busy|in use)|your call is (?:very )?important|(?:answered|taken) in the order (?:it was|they were) received|(?:estimated|expected|approximate) wait time|next available|in (?:the )?queue|being transferred|transferring (?:you|your call)|(?:i'?ll )?be right back|be right with you|(?:have|need|got) to (?:check|ask)|check with (?:the|my|our) (?:manager|supervisor|team|kitchen|doctor)|(?:keep|hold) me (?:one|a) (?:sec(?:ond)?|moment|minute)|por favor espere|permanezca en (?:la )?l[ií]nea|todos nuestros (?:representantes|agentes|operadores|asociados) (?:est[aá]n )?(?:ocupados|atendiendo)|su llamada es (?:muy )?importante|en el orden (?:en )?(?:que|en que) (?:fue|fueron) recibidas?|tiempo (?:estimado |aproximado )?de espera|siendo transferida|le (?:estamos )?transfiriendo)\b/i;
/** Our caller only acknowledging ("sure", "okay, no problem"): not an answer to someone back from a hold. */
const ACKNOWLEDGMENT = /^(?:(?:sure|okay|ok|alright|all right|no problem|of course|take your time|thanks?|thank you|got it|perfect|great|sounds good|yes|yeah)[\s,.!]*)+$/i;
// "Thank you for holding" and "this is a recorded line" are common in queue recordings, so they don't count.
const PERSON_BACK = /\b(?:my name is|how (?:can|may) i (?:help|assist)|(?:are you )?still there|sorry (?:about|for) the wait|mi nombre es|le habla|en qu[eé] (?:le|lo|la) (?:puedo|podemos) (?:ayudar|servir)|disculpe la espera)\b/i;

/** A line from the other side that is part of the wait: a hold request or a queue recording. */
export function isHoldLine(text: string): boolean {
  return QUEUE_RECORDING.test(text) || asksUsToWait(text);
}

export type HoldChange = { type: 'start'; at: number } | { type: 'end'; at: number; seconds: number };

export class HoldMeter {
  private since: number | null = null;
  /** The other side's words since our caller last answered them. */
  private theirs = '';
  /** Our caller's words since the other side last spoke. */
  private mine = '';
  /** When they started saying something that is not a hold recording, while on hold. */
  private speechAt: number | null = null;

  /** Resume a hold already in progress (the session object was reset mid-call). */
  constructor(since: number | null = null) {
    this.since = since;
  }

  holding(): boolean {
    return this.since !== null;
  }

  /** Words from the other side. Returns the change in hold state, if any. Judged one sentence at a time. */
  them(delta: string, at: number): HoldChange | null {
    if (!delta) return null;
    this.theirs += delta;
    this.mine = '';
    const sentence = lastSentence(this.theirs);
    if (this.since === null) return isHoldLine(sentence) ? this.start(at) : null;
    if (isHoldLine(sentence)) {
      this.speechAt = null;
      return null;
    }
    if (PERSON_BACK.test(sentence)) return this.end(this.speechAt ?? at);
    if (this.speechAt === null && /\w{2,}/.test(sentence)) this.speechAt = at;
    return null;
  }

  /**
   * Our caller spoke. A person who spoke just before and got an answer is back from the hold. A
   * bare "sure" or "okay" is not an answer, and keeps their half-heard sentence together: speech
   * comes in fragments, and "I'll be right" / "Sure." / "back" is still one hold request.
   */
  caller(delta: string): HoldChange | null {
    if (!delta.trim()) return null;
    this.mine += delta;
    if (ACKNOWLEDGMENT.test(this.mine.trim())) return null;
    this.theirs = '';
    if (this.since !== null && this.speechAt !== null) return this.end(this.speechAt);
    this.speechAt = null;
    return null;
  }

  private start(at: number): HoldChange {
    this.since = at;
    this.speechAt = null;
    this.theirs = '';
    this.mine = '';
    return { type: 'start', at };
  }

  private end(at: number): HoldChange {
    const seconds = Math.max(0, Math.round((at - this.since!) / 1000));
    this.since = null;
    this.speechAt = null;
    this.theirs = '';
    return { type: 'end', at, seconds };
  }
}

function lastSentence(text: string): string {
  const sentences = text.trim().split(/[.?!]+\s+/);
  return sentences[sentences.length - 1] ?? '';
}
