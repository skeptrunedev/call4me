import { pcmuMs } from './dtmf';

/**
 * GPT-Live makes sounds that aren't answers, and a recording that listens for speech takes them
 * as one: GE Appliances' menu heard "Okay." of "Okay. Schedule a repair." and said "Sorry, I didn't
 * get that", heard "Hmm." of "Hmm. No." and said "That input was invalid", and got "mm-hmm" over
 * its greeting (Kate's call_ldb8bzvlopko2yzl, Nov 25). The prompt says not to (prompt.ts
 * BACKCHANNEL_POLICY) and an evaluation against GE's prompts still got "Mm-hmm. Schedule a repair."
 * (scripts/eval-speech-menu.ts). A prompt can't guarantee silence: OpenAI's answer is to check
 * speech before it plays. So on an automated line the session holds each stretch of the caller's
 * speech until its words are known, and drops a stretch that is only such sounds.
 *
 * GPT-Live's transcript runs 200-300ms ahead of its audio, so a stretch's first words have arrived
 * by the time its sound does: speech that starts with a real word plays without delay, and only a
 * stretch whose words so far are filler waits. A stretch with no words ahead of it plays, as does a
 * filler said in the same breath as the answer ("okay schedule a repair"): recognizers take a
 * breath whole and match the answer in it, and cutting it would take word timings GPT-Live doesn't give.
 */

/** Sounds with no answer in them, repeated letters collapsed ("hmmm" is "hm", "mm-hmm" is "m-hm"). "Yeah" and "sure" answer a yes-or-no question, so they're not here. */
const FILLERS = ['uh', 'um', 'uhm', 'hm', 'm', 'mhm', 'm-hm', 'uh-huh', 'ah', 'oh', 'okay', 'ok'];
const collapse = (word: string) => word.toLowerCase().replace(/(.)\1+/gu, '$1');

/** Silence that ends a stretch: GPT-Live pauses at least this long after a sentence, not between words. */
const GAP_MS = 160;
/** A stretch still undecided after this much audio plays: no filler runs this long. */
const MAX_HOLD_MS = 1_500;
/** Words that never got a sound, after this much silence: a breath transcribed as "[breath]". */
const UNSPOKEN_MS = 1_500;

/**
 * What a stretch's words say so far: speech as soon as one real word is in, filler only once the
 * stretch is over (`done`), since more words may follow "Okay." in the same breath.
 */
export function judge(text: string, done: boolean): 'speech' | 'filler' | 'undecided' {
  // Sounds GPT-Live transcribes in brackets ("[breath]", "[lip smack]") are filler, and one still being written may be.
  const open = /\[[^\]]*$/.test(text);
  const words = text
    .replace(/\[[^\]]*\]?/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
  const growing = !done && !open && !/[\s\p{P}]$/u.test(text);
  for (const [i, word] of words.entries()) {
    const c = collapse(word);
    if (FILLERS.includes(c)) continue;
    // The last word may still be coming in: "Mm-h" may end "mm-hmm", "O" may end "okay".
    if (growing && i === words.length - 1 && FILLERS.some((f) => f.startsWith(c))) return 'undecided';
    return 'speech';
  }
  if (!done) return 'undecided';
  // Punctuation alone is a sound with no word in it; nothing at all is a stretch the gate never held.
  return words.length || open || /\p{P}/u.test(text) ? 'filler' : 'speech';
}

/** What the session does with the caller's output now: audio to play in order, words now on the line, and words kept off it. */
export interface GateOut {
  play: string[];
  words: string;
  dropped: string;
}

export class FillerGate {
  private state: 'quiet' | 'judging' | 'playing' = 'quiet';
  /** The stretch being judged: its audio and words. */
  private held: string[] = [];
  private heldMs = 0;
  private words = '';
  /**
   * Words that came during a pause or before any sound: the next stretch's, unless this one goes
   * on. Once they hold a real word they're on the transcript already (`nextSpeech`), and the sound
   * they lead plays.
   */
  private next = '';
  private nextSpeech = false;
  private nextQuietMs = 0;
  /** Silent audio since the stretch's last sound, in ms of audio (GPT-Live streams faster than it plays). */
  private silentMs = 0;

  /** The caller's words, which arrive ahead of their audio. Returns the ones already on the line. */
  hear(delta: string): string {
    if (this.silentMs === 0 && this.state === 'playing') return delta;
    if (this.silentMs === 0 && this.state === 'judging') {
      this.words += delta;
      return '';
    }
    if (this.nextSpeech) return delta;
    this.next += delta;
    // In a held stretch's pause they wait with it, to keep the transcript in order however it ends.
    return this.state === 'judging' ? '' : this.speakNext();
  }

  /** The waiting words, onto the transcript once they hold a real word. */
  private speakNext(): string {
    if (!this.next || judge(this.next, false) !== 'speech') return '';
    const words = this.next;
    this.next = '';
    this.nextSpeech = true;
    return words;
  }

  /** A chunk of the caller's audio. */
  audio(payload: string, audible: boolean): GateOut {
    const out: GateOut = { play: [], words: '', dropped: '' };
    const ms = pcmuMs(payload);
    if (this.state === 'quiet') {
      if (!audible) {
        this.expireNext(ms, out);
        out.play.push(payload);
        return out;
      }
      // Only a stretch led by words that may be filler waits. One with no words ahead of it is a
      // sound the transcript missed, or words running late: it plays, as before the gate.
      this.state = this.next && !this.nextSpeech ? 'judging' : 'playing';
      this.held = [];
      this.heldMs = 0;
      this.words = '';
    }
    if (audible) {
      this.silentMs = 0;
      // Words that came in a pause belong to this stretch after all: it went on.
      if (this.state === 'judging' && this.nextSpeech) this.state = 'playing';
      if (this.state === 'playing') {
        this.release(out);
        out.words += this.next;
      } else this.words += this.next;
      this.next = '';
      this.nextSpeech = false;
      this.nextQuietMs = 0;
    } else this.silentMs += ms;
    const done = this.silentMs >= GAP_MS;
    if (this.state === 'playing') {
      out.play.push(payload);
      if (done) this.state = 'quiet';
      return out;
    }
    this.held.push(payload);
    this.heldMs += ms;
    const verdict = judge(this.words, done);
    if (verdict === 'filler') {
      out.dropped = this.words;
      this.held = [];
      this.heldMs = 0;
      this.words = '';
      this.state = 'quiet';
      out.words = this.speakNext();
    } else if (verdict === 'speech' || this.heldMs >= MAX_HOLD_MS) {
      this.release(out);
      this.state = done ? 'quiet' : 'playing';
    }
    return out;
  }

  /** Everything held, played: the line is no longer automated. */
  flush(): GateOut {
    const out: GateOut = { play: [], words: '', dropped: '' };
    if (this.state === 'judging') this.state = this.silentMs > 0 ? 'quiet' : 'playing';
    this.release(out);
    out.words += this.next;
    this.clearNext();
    return out;
  }

  /** Everything held, dropped: the caller was kept off the line, and what it held must not play later. */
  reset(): void {
    if (this.state === 'judging') this.state = 'quiet';
    this.held = [];
    this.heldMs = 0;
    this.words = '';
    this.clearNext();
  }

  private release(out: GateOut): void {
    out.play.push(...this.held);
    out.words += this.words;
    this.held = [];
    this.heldMs = 0;
    this.words = '';
  }

  private clearNext(): void {
    this.next = '';
    this.nextSpeech = false;
    this.nextQuietMs = 0;
  }

  /** Words with no sound after them for a while were never said aloud: a breath's "[breath]" is dropped. */
  private expireNext(ms: number, out: GateOut): void {
    if (!this.next && !this.nextSpeech) return;
    this.nextQuietMs += ms;
    if (this.nextQuietMs < UNSPOKEN_MS) return;
    if (judge(this.next, true) === 'filler') out.dropped += this.next;
    else out.words += this.next;
    this.clearNext();
  }
}
