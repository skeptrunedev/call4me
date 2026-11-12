/**
 * When the business has the caller waiting: put on hold, transferred, or queued behind "all our
 * representatives are busy". Hold time is billed at half price and lets a call run past its time
 * limit, so this errs toward staying on hold until a person is clearly back.
 *
 * A hold starts when the other side asks us to wait or plays a queue recording. It ends when
 * someone greets us ("my name is", "how can I help"), or when they say something that is
 * not a hold recording and our caller answers it, back-dated to when they started talking. Our
 * caller's own "sure, no problem" to "please hold" does not end it.
 *
 * A voicemail greeting is not a hold, though many say "your call is important to us": once it asks
 * for a message, the hold ends. Nobody comes back to a voicemail to end it otherwise, so it kept a
 * silent line billing past its limit (Fiola's events line, 12 minutes after the message was left).
 */
import { asksForMessage, asksUsToWait, isPhoneMenu, JA_KEYPAD, JA_WAIT, SENTENCE_END } from './handoff';

// "Please stay on the line" asks us to wait; "I'll stay on the line until you have those details"
// is them waiting on us. The Coronet's leasing bot said it every 30s, and its "holds" bought a call
// going nowhere 15 more minutes past its time limit.
const QUEUE_RECORDING = /\b(?:please hold|on (?:a )?(?:(?:brief|short|quick|little|small) )?hold|(?:put|putting|place|placing) you on (?:a )?(?:\w+ )?hold|(?:let me|i'?ll|i will|i'?m going to|i'?m gonna|while i|as i|i'?m|i am) (?:connect|transfer)(?:ing)? you|(?<!(?:i|we)(?:'?ll| will| can) )(?:stay|remain) on the line|(?:all )?(?:of )?our (?:agents|representatives|reps|operators|associates|team members)(?: are)? (?:currently )?(?:busy|assisting|helping)|all (?:agents|representatives|reps|operators|associates|lines) are (?:currently )?(?:busy|in use)|your call is (?:very )?important|(?:answered|taken) in the order (?:it was|they were) received|(?:estimated|expected|approximate) wait time|next available|(?:in|on) (?:the |our )?(?:call )?queue|being transferred|transferring (?:you|your call)|(?:i'?ll )?be right back|be right with you|(?:have|need|got) to (?:check|ask)|check with (?:the|my|our) (?:manager|supervisor|team|kitchen|doctor)|(?:keep|hold) me (?:one|a) (?:sec(?:ond)?|moment|minute)|por favor espere|permanezca en (?:la )?l[ií]nea|todos nuestros (?:representantes|agentes|operadores|asociados) (?:est[aá]n )?(?:ocupados|atendiendo)|su llamada es (?:muy )?importante|en el orden (?:en )?(?:que|en que) (?:fue|fueron) recibidas?|tiempo (?:estimado |aproximado )?de espera|siendo transferida|le (?:estamos )?transfiriendo)\b/i;
/**
 * Someone asking us to wait, said any of the ways real reps say it on our calls ("allow me a minute
 * to pull this up", "lemme see what I can find real quick", "do you mind holding for a second",
 * "you are number 1"). Deliberately liberal: a false start only bills some talk at half price and
 * may extend a call that's still going, while a missed hold gets the call cut off at its limit.
 */
const WAIT_REQUEST = new RegExp(
  String.raw`\b(?:` +
    [
      String.raw`(?:a|one|just a|just one|a brief|a quick|brief|quick|a couple(?: of)?|couple(?: of)?|a few|few|two|five) (?:little )?(?:sec(?:ond)?s?|moments?|minutes?|mins?)`,
      String.raw`moment,? please|momentito|un momento|un segundo`,
      String.raw`hold(?:ing)? (?:the line|for|while|please|tight|one|a sec)|(?:mind|can you|could you|would you|will you) hold(?:ing)?|hold please|please wait|wait(?:ing)? (?:just )?(?:a|one)|bear with`,
      String.raw`(?:let me|lemme|let's|let us|allow me(?: to)?|i'?ll|i will|i'?m going to|i'?m gonna|gonna|i need to|i have to|i'?d have to|i want to) (?:just |quickly |real quick |go ahead and |quickly go ahead and |double )?(?:check|see|look|find|pull|search|verify|confirm|double[- ]check|get (?:you|someone|somebody|that)|grab|ask|talk to|speak (?:to|with)|consult|review|transfer|connect|put you|escalate|reach out)`,
      String.raw`(?:i'?m|i am) (?:just |still )?(?:checking|looking|searching|pulling|trying to find|verifying|confirming|transferring|connecting|waiting on)`,
      String.raw`give me (?:just |one )?(?:a|one|two|a couple|a few|some|a sec)|allow me a`,
      String.raw`you are (?:caller )?number (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)|your (?:current )?position`,
      String.raw`all (?:of )?(?:our )?(?:agents|representatives|reps|operators|associates|team members|lines|staff|specialists|advisors) (?:are )?(?:currently )?(?:busy|assisting|helping|occupied|with other|on other)`,
      String.raw`(?:current|estimated|expected|approximate|average) (?:hold|wait) time`,
      String.raw`(?:may|will) be (?:monitored|recorded)|is being recorded|recorded for quality`,
      String.raw`someone (?:who|that) can help|right person|right department`,
      String.raw`(?:will|'ll) be with you|(?:still )?(?:helping|assisting|serving|with|on the phone with) other (?:callers|patients|customers|guests|clients|members|people)|hold your place|place in (?:line|the queue)|(?:sorry|apologi[sz]e) (?:about |for )?(?:the|your) wait|thanks? (?:you )?(?:so much |kindly )?for (?:your )?(?:patience|holding|waiting)`,
      String.raw`(?:let me|lemme|allow me to|i'?ll|i will|i'?m going to|i'?m gonna|i'?m just going to) (?:just |quickly |go ahead and )?take a (?:quick |little )?look|(?:^|[\s,]+)(?<!at the )(?:moment|hold|sec|second|minute)[\s.!]*$`,
    ]
      .map((p) => `(?:${p})`)
      .join('|') +
    String.raw`)\b`,
  'i',
);

/** Our caller only acknowledging ("sure", "okay, no problem"): not an answer to someone back from a hold. */
const ACKNOWLEDGMENT = /^(?:(?:\[[^\]]*\]?|[^\s[\]]*\]|sure|okay|ok|alright|all right|no problem|no worries|of course|take your time|thanks?|thank you|got it|perfect|great|sounds good|yes|yeah|hmm+|mm-?hmm|uh-?huh|will do|i can wait|i'?ll (?:stay on the line|keep waiting|keep holding|hold|wait|stay on|hang on)|i'?m (?:still )?(?:here|on the line|holding|waiting)|はい|ええ|うん|(?:よろしく)?お願い(?:いた)?します|わかりました|分かりました|承知(?:いた)?しました|かしこまりました|大丈夫です|ありがとうございます|(?:お)?待ちします|待ちます)[\s,.!、。！]*)+$/i;
// "Thank you for holding" and "sorry for the wait" are queue recordings as often as people, so they don't count.
// Japanese has no \b, so its "my name is" (赤間と申します) sits outside it.
const PERSON_BACK = /\b(?:my name is|how (?:can|may) i (?:help|assist)|(?:are you )?still there|mi nombre es|le habla|en qu[eé] (?:le|lo|la) (?:puedo|podemos) (?:ayudar|servir))\b|と申します/i;

/** A line from the other side that is part of the wait: a hold request or a queue recording. */
function isHoldLine(text: string): boolean {
  return QUEUE_RECORDING.test(text) || WAIT_REQUEST.test(text) || JA_WAIT.test(text) || asksUsToWait(text);
}

export type HoldChange = { type: 'start'; at: number } | { type: 'end'; at: number; seconds: number };

export class HoldMeter {
  private since: number | null = null;
  /** The other side's words since our caller last answered them. */
  private theirs = '';
  /** Our caller's words since the other side last spoke. */
  private mine = '';
  /** When they started their latest sentence that is not a hold recording or a menu, while on hold. */
  private speechAt: number | null = null;
  /** How many sentences of theirs have started since our caller last answered, and when the latest began. */
  private sentences = 0;
  private sentenceAt = 0;

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
    // Our caller's turn is over once they speak again: judge it whole.
    const answered = this.settleCaller();
    if (answered) {
      this.theirs = delta;
      this.sentences = 0;
      return answered;
    }
    // The sentence that was still open before this delta may have grown or finished.
    const from = Math.max(0, this.sentences - 1);
    this.theirs += delta;
    const all = this.theirs.trim().split(SENTENCE_END).filter(Boolean);
    if (all.length !== this.sentences) {
      this.sentences = all.length;
      this.sentenceAt = at;
    }
    // Every sentence this delta touched, in order, not only the last: Grant's call reached a
    // voicemail whose "if you leave your name and number, I will return it." finished in the same
    // delta as "Thank you and have a great day", so its request for a message went unseen and the
    // silent line was held open as a hold for 10 minutes.
    let change: HoldChange | null = null;
    all.slice(from).forEach((sentence, i) => {
      const next = this.judge(sentence, from + i < all.length - 1, at);
      // A hold that starts and ends within one delta never was one.
      if (next) change = change?.type === 'start' && next.type === 'end' ? null : next;
    });
    return change;
  }

  /** One sentence of theirs, heard by `at`; `finished` when more followed it. */
  private judge(sentence: string, finished: boolean, at: number): HoldChange | null {
    // A person greeting us outranks hold words in the same breath ("thanks for holding, how can I help?").
    if (this.since === null) return isHoldLine(sentence) && !PERSON_BACK.test(sentence) && !asksForMessage(sentence) ? this.start(at) : null;
    if (PERSON_BACK.test(sentence)) return this.end(this.speechAt ?? at);
    // Judged once the sentence is finished: "To leave a message," may still end "press two".
    if ((finished || /[.?!]\s*$/.test(sentence)) && asksForMessage(sentence)) return this.end(this.sentenceAt);
    // A phone menu inside the queue ("press two for general inquiries") is part of the wait, not a person.
    if (isHoldLine(sentence) || isPhoneMenu(sentence) || JA_KEYPAD.test(sentence)) {
      this.speechAt = null;
      return null;
    }
    // Back-dated to their latest sentence, not their first: hold music transcribed as lyrics runs
    // straight into a person, and the music is still part of the hold. Letters in any script: \w is
    // ASCII only, so a Japanese agent back from a hold never counted as speech, and freee's support
    // desk billed 17 minutes of conversation as hold, running the call past its time limit.
    if (/[\p{L}\p{N}]{2,}/u.test(sentence)) this.speechAt = this.sentenceAt;
    return null;
  }

  /**
   * Our caller spoke. Its words stream in a few at a time and "Hmm. I'll" could still become "Hmm.
   * I'll stay on the line", so nothing is decided here: the turn is judged whole once the other
   * side speaks again (settleCaller). Never changes the hold state itself.
   */
  caller(delta: string): HoldChange | null {
    if (delta.trim()) this.mine += delta;
    return null;
  }

  /**
   * Our caller's finished turn. A person who spoke just before and got an answer is back from the
   * hold, back-dated to when they started. A bare "sure" or "I'll stay on the line" is not an
   * answer, and keeps their half-heard sentence together: speech comes in fragments, and "I'll be
   * right" / "Sure." / "back" is still one hold request.
   */
  private settleCaller(): HoldChange | null {
    const mine = this.mine.trim();
    this.mine = '';
    if (!mine || ACKNOWLEDGMENT.test(mine)) return null;
    this.theirs = '';
    this.sentences = 0;
    if (this.since !== null && this.speechAt !== null) return this.end(this.speechAt);
    this.speechAt = null;
    return null;
  }

  /** Stop timing a hold at `at` (the user took the call over), returning its end if one was going. */
  stop(at: number): HoldChange | null {
    return this.since === null ? null : this.end(at);
  }

  private start(at: number): HoldChange {
    this.since = at;
    this.speechAt = null;
    this.theirs = '';
    this.sentences = 0;
    this.mine = '';
    return { type: 'start', at };
  }

  private end(at: number): HoldChange {
    const seconds = Math.max(0, Math.round((at - this.since!) / 1000));
    this.since = null;
    this.speechAt = null;
    this.theirs = '';
    this.sentences = 0;
    return { type: 'end', at, seconds };
  }
}
