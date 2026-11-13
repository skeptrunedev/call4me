import type { TranscriptLine } from '../services/call-store';

/**
 * GPT-Live decides on its own when to hand work to the back office, and sometimes it says the
 * hand-off out loud ("2.", "let me check on that real quick", "bye!") without ever delegating:
 * no delegation event, no error, nothing runs. A phone menu only hears the keypad, so a spoken
 * "2" loops the menu forever. The session watches the transcript for these moments and starts
 * the back office itself (response.item.create + response.create) when no hand-off follows.
 */

const KEY = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|zero|pound|star|hash|asterisk|[*#])`;
const KEY_ES = String.raw`(?:\d+|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|asterisco|estrella|numeral|almohadilla|[*#])`;
// JavaScript's \b only knows ASCII letters, so Spanish patterns never put \b next to an accented one.
const KEYPAD_MENU = [
  new RegExp(String.raw`\bpress(?:ing)?\s+(?:the\s+)?${KEY}(?!\w)`, 'i'),
  new RegExp(String.raw`\bdial\s+(?:the\s+)?${KEY}(?!\w)`, 'i'),
  /\bpress (?:any|a) key\b/i,
  /\b(?:enter|type|key in)\b[^.?!]{0,60}\b(?:keypad|followed by (?:the )?(?:pound|hash|star))\b/i,
  /\bmenu options\b/i,
  /\bappuyez\b[^.?!]{0,30}\b(?:sur|le)\b/i,
  /\bcomposez\b[^.?!]{0,40}\b(?:zéro|zero|un|deux|trois|quatre|cinq|six|sept|huit|neuf|\d)\b/i,
  new RegExp(String.raw`\b(?:oprima|presione|pulse|marque|digite|teclee)\b[^.?!]{0,30}?\b${KEY_ES}(?!\w)`, 'i'),
];
const ENTER_NUMBER = [
  /\b(?:please )?enter\b[^.?!]{0,60}\b(?:order|account|extension|pin|code|number)\b/i,
  /\b(?:marque|m[aá]rquel[ao]|digite|ingrese|introduzca)\b[^.?!]{0,60}\b(?:extensi[oó]n|n[uú]mero|c[oó]digo|cuenta|pin)/i,
  // "Si conoce el número de extensión, márquela en este momento."
  /\bextensi[oó]n\b[^.?!]{0,40}\bm[aá]rquel[ao]\b/i,
];
const WEB_ENTRY = /\b(?:website|web site|browser|online|form|internet|sitio web|p[aá]gina web)\b/i;
const MENU = [...KEYPAD_MENU, ...ENTER_NUMBER];

/** A recording offering keypad choices, or asking for keypad input. */
export function isPhoneMenu(text: string): boolean {
  return MENU.some((re) => re.test(text));
}

// Italian and French too: Besfid & Pianca's "la metto un attimino in attesa" went unheard as a hold, and the
// time limit hung up on James's call to Lugano mid-wait.
// "Please stay on the line" asks us to wait; "I'll stay on the line until you have those details" is
// them waiting on us, so the quiet after it is ours to break (hold.ts QUEUE_RECORDING, likewise).
const HOLD_REQUEST = /\b(?:please hold|on hold|hold on|hold time|wait time|next available|in (?:the )?queue|caller number|hang on|bear with me|(?<!(?:i|we)(?:'?ll| will| can) )(?:stay|remain) on the line|(?:one|just a|give me a) (?:sec(?:ond)?|moment|minute)|let me (?:check|see|look|pull)|(?:being )?transferr?(?:ed|ing)|un moment(?:o|ito)|espere|perm[ií]tame|d[eé]jeme (?:verificar|ver|revisar|buscar)|en espera|permanezca en (?:la )?l[ií]nea|le (?:transfiero|comunico|estamos transfiriendo)|in attesa|(?:un )?attim(?:o|ino)|aspett[ia]|resti in linea|rimanga in linea|attenda in linea|ne quittez pas|patientez|un (?:petit )?instant|je vous mets en attente)\b/i;

/**
 * Japanese queue and transfer recordings ("しばらくお待ちください", "オペレーターにおつなぎいたします",
 * "お電話が大変混み合っております"). No \b: word boundaries don't exist between Japanese characters.
 */
// "少々確認いたしますので、お時間いただいてもよろしいでしょうか": a rep going to check.
export const JA_WAIT = /(?:お待ちください|お待ち下さい|しばらくお待ち|少々お待ち|おつなぎ(?:いた)?します|おつなぎするまで|お繋ぎ(?:いた)?します|混み合って|込み合って|確認(?:いた)?しますので|お調べ(?:いた)?しますので|少々お時間|お時間(?:を)?いただ(?:いて|け)(?:も)?(?:よろしい|ますか))/;
/** A Japanese recording offering keys ("2、を押してください"). */
export const JA_KEYPAD = /押してください/;

/** Sentence ends: English punctuation followed by a space, or Japanese full stops, which have none. */
export const SENTENCE_END = /[.?!]+\s+|[。？！]+/;

/**
 * The other side's latest sentence asked us to wait (a hold, a transfer, "let me check"), so any
 * quiet that follows is theirs to break, not ours.
 */
export function asksUsToWait(text: string): boolean {
  const sentences = text.trim().split(SENTENCE_END).filter(Boolean);
  const last = sentences[sentences.length - 1] ?? '';
  return HOLD_REQUEST.test(last) || JA_WAIT.test(last);
}

const PROMISES = [
  /\b(?:let me|lemme) (?:check|see|look|find out)\b/i,
  /\b(?:one|just a) (?:sec(?:ond)?|moment|minute)\b/i,
  /\bhang on\b/i,
  /\bi'?ll (?:check|find out|ask)\b/i,
  /\b(?:good)?bye\b/i,
  /\bhave a (?:good|great|nice|wonderful) (?:one|day|night|evening|afternoon|weekend)\b/i,
  /\b(?:adi[oó]s|hasta luego|hasta pronto|chao|chau|buenas noches)\b/i,
  /\bque tenga(?:s)? (?:un |una )?buen[oa]s? (?:d[ií]a|noche|tarde|fin de semana)\b/i,
  // \b only knows ASCII letters, so Greek words are bounded by \p{L} instead.
  /(?:^|\P{L})(?:αντ[ιί]ο|καλην[υύ]χτα|καλ[οό] (?:βρ[αά]δυ|απ[οό]γευμα|σαββατοκ[υύ]ριακο)|καλ[ηή] συν[εέ]χεια|να ?['’]?(?:στε|ε[ιί]στε) καλ[αά])(?!\p{L})/iu,
];

/**
 * "Γεια σας" is hello as much as goodbye. It ends the caller's line as a goodbye only once the caller
 * has said what it called about: an opening "Γεια σας!" answered "Γεια σας" isn't the call ending.
 */
const GREEK_HELLO_OR_BYE = /(?:^|\P{L})γ[εέ]ι[αά] σ(?:[αά]ς|ου)[\s,.!]*$/iu;
const OPENING_CHARS = 60;

function greekGoodbye(lines: TranscriptLine[], i: number): boolean {
  if (!GREEK_HELLO_OR_BYE.test(lines[i].text)) return false;
  const before = lines.slice(0, i).filter((l) => l.role === 'caller').reduce((n, l) => n + l.text.trim().length, 0);
  return before >= OPENING_CHARS;
}

/** Their reply opening with a goodbye, perhaps after a word ("Cool. Bye.", "Okay bye, ..."). */
const OPENS_WITH_GOODBYE = /^[\s,.!]*(?:[a-z']+[\s,.!]+)?(?:good-?)?bye\b/i;

/**
 * The other side only closing the call after our caller's goodbye: "you too", "de nada", "buenas noches",
 * "Yeah, you're welcome. Thank you for calling Penn State Health" (that one left Juan's booked call
 * silent for 47s until the time limit).
 */
// Their goodbye often splits around ours ("You have a good" / "Bye." / "day Buh-bye"), so the tail
// of a closing phrase ("day", "you", "one") and noises ("uh-huh", "[gulp]") count as closing too.
const CLOSING = /^[\s,.!]*(?:(?:ok(?:ay)?|alright|all right|yeah|yep|yes|sure|thank(?:s| you) for calling(?: [\w'&-]+){0,6}|thanks?|thank you|you too|same to you|bye(?:[- ]bye)?|goodbye|good ?night|have a (?:good|great|nice|wonderful) (?:one|day|night|evening)|take care|you'?re welcome|no problem|mhm|mm-?hm+|uh-?huh|buh[- ]?bye|\[[^\]]*\]?|day|night|evening|one|weekend|you|de nada|gracias|igualmente|buenas noches|buen d[ií]a|adi[oó]s|hasta luego|chao|γ[εέ]ι[αά](?: σ(?:[αά]ς|ου))?|(?:σας )?ευχαριστ(?:[ωώ]|ο[υύ]με)(?: (?:π[αά]ρα )?πολ[υύ])?|κι εγ[ωώ]|κι εσ[εέ]ις|επ[ιί]σης|αντ[ιί]ο|χα[ιί]ρετε|καλην[υύ]χτα|καλημ[εέ]ρα|καλ[οό] (?:βρ[αά]δυ|απ[οό]γευμα)|καλ[ηή] (?:συν[εέ]χεια|μ[εέ]ρα|βραδι[αά])|να ?['’]?(?:στε|ε[ιί]στε) καλ[αά]|εντ[αά]ξει|ν[αά]ι|παρακαλ[ωώ]|οκ[εέ]ι?|μχμ)[\s,.!]*)+$/i;

/** The caller said it would go do something (look something up, hang up) that needs the back office. */
export function promisesAction(text: string): boolean {
  return PROMISES.some((re) => re.test(text));
}

const MENU_FAILURE = [
  /\bno (?:input|selection|entry|response) (?:was )?(?:received|detected)\b/i,
  /\b(?:did not|didn't|haven't|have not) receive (?:your |an? )?(?:input|selection|entry|response)\b/i,
  /\b(?:entry|selection|input) (?:is |was )?(?:invalid|not (?:recognized|recognised|valid))\b/i,
  /\b(?:don't|do not|didn't|did not) (?:recognize|recognise) (?:that|your) (?:entry|selection|input)\b/i,
  /\b(?:exceeded|maximum number of) (?:the )?(?:maximum number of )?attempts\b/i,
  /\bif this (?:has )?answered your question\b/i,
  /\bno (?:hemos|he|se ha) recibido (?:su |ninguna )?(?:selecci[oó]n|respuesta|opci[oó]n|entrada)/i,
  /\b(?:selecci[oó]n|opci[oó]n|entrada)\b[^.?!]{0,20}\b(?:no es v[aá]lida|inv[aá]lida|incorrecta)/i,
  /\bexcedido el (?:n[uú]mero )?(?:m[aá]ximo )?(?:de )?intentos/i,
  /\b(?:return|visit|go to|click on)\b[^.?!]{0,100}\b(?:warehouse|website|web site|customer service page|return or replace)\b/i,
];
const HUMAN_GREETING_ES = /\b(?:mi nombre es|le habla|en qu[eé] (?:le|lo|la|les) (?:puedo|podemos) (?:ayudar|servir))\b/i;
const HUMAN_GREETING = [/(?:^|[.!?\n])\s*(?:my name is\b|how (?:can|may) i (?:help|assist)\b|thank you for (?:holding|waiting)\b)/i, HUMAN_GREETING_ES];
const WAIT_OR_PERSON = [
  /\b(?:please (?:hold|stay on the line|remain on the line)|on hold|all (?:our )?representatives are busy|call (?:is )?being transferred)\b/i,
  /(?:^|[.!?\n])\s*(?:hello\b|hi\b|my name is\b|how (?:can|may) i (?:help|assist)\b|thank you for (?:holding|waiting)\b)/i,
  /\b(?:por favor (?:espere|permanezca en (?:la )?l[ií]nea)|todos nuestros (?:representantes|agentes|operadores) (?:est[aá]n )?ocupados|(?:est[aá] )?siendo transferida|le (?:estamos )?transfiriendo)\b/i,
  /(?:^|[.!?\n¿¡])\s*hola\b/i,
  HUMAN_GREETING_ES,
];

function lastMatch(text: string, patterns: RegExp[]): number {
  let index = -1;
  for (const pattern of patterns) {
    for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) index = Math.max(index, match.index);
  }
  return index;
}

/**
 * The keypad offer at `at` is a voicemail's own recording control, after its request for a
 * message: "Record your message at the tone. Press any key or stop talking to end the recording."
 * Read as a menu waiting on its key, it kept our caller off the line for the whole recording:
 * Beatrix Parties recorded only "...dining room available" of the message, then the back office
 * pressed re-record five times into the same muting before saving it. A review menu after the
 * recording (save, listen, re-record) is still a menu.
 */
function recordingControl(text: string, at: number): boolean {
  const start = Math.max(...['.', '?', '!', '\n'].map((c) => text.lastIndexOf(c, at))) + 1;
  const end = text.slice(at).search(/[.?!\n]/);
  return RECORDING_CONTROL.test(text.slice(start, end < 0 ? text.length : at + end)) && VOICEMAIL_PROMPT.test(text.slice(0, at));
}
const RECORDING_CONTROL = /\b(?:(?:end|finish|stop|complete)\b[^.?!]{0,20}\brecording|finished recording|when (?:you(?:'re| are| have|'ve) )?(?:finished|done))\b/i;

/** Recognize keypad intent, not acknowledgments such as "you pressed two" or ordinary filler. */
function spokenKeypadDigits(text: string): string | null {
  const action = new RegExp(String.raw`\b(?:press(?:ing)?|dial(?:ing)?|enter(?:ing)?|send(?:ing)?|select(?:ing)?|choos(?:e|ing)|try(?:ing)?|hit(?:ting)?|tap(?:ping)?|now|next)[\s,:]+(?:the\s+)?(${KEY}(?:[\s,]+${KEY})*)(?!\w)`, 'gi');
  const words: Record<string, string> = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', star: '*', asterisk: '*', pound: '#', hash: '#' };
  let keys = new RegExp(String.raw`^\s*(${KEY})[.!?\s]*$`, 'i').exec(text)?.[1];
  for (const match of text.matchAll(action)) {
    if (!/\b(?:don't|do not|not|never)\s*$/i.test(text.slice(0, match.index))) keys = match[1];
  }
  return keys ? [...keys.toLowerCase().matchAll(new RegExp(KEY, 'g'))].map(([key]) => words[key] ?? key).join('') : null;
}

export type MissedHandoff = { reason: 'menu' | 'menu_recovery' | 'keypad' | 'promise' | 'voicemail_left' | 'greeting_waiting' | 'signed_off'; line: TranscriptLine; menuContext?: string };
type MenuSnapshot = { text: string; end: number; at: number; callerEnd: number };
type KeypadAttempt = { digits: string; prompt: string; inputEnd: number; at: number };

/**
 * How far the other side's transcript runs behind their audio. Words transcribed this soon after a key
 * press were spoken before it: the rest of the menu it answered, not a reply to it. Taking them for a
 * new menu pressed the same key again into whatever came next (Structure Properties got 4 twice,
 * Klingbeil 0 three times, Gordon-Clifford 2 twice, 2026-11-09).
 */
export const KEY_TRANSCRIPT_LAG_MS = 2_000;

/** Fresh IVR input is tracked separately: a transcript line can span several menus. */
export class MenuRecovery {
  private input = '';
  private boundary = 0;
  private at = 0;
  private menuContext = '';
  private personSpeaking = false;
  private attempts: KeypadAttempt[] = [];
  private callerInput = '';
  private callerBoundary = 0;
  private callerAt = 0;
  private observedCallerEnd = 0;

  observe(delta: string, at: number): void {
    // Providers may omit sentence punctuation between turns. Preserve that turn boundary.
    if (this.callerInput.length > this.observedCallerEnd) this.input += '\n';
    this.observedCallerEnd = this.callerInput.length;
    this.input += delta;
    this.at = at;
    // A person can give website instructions too. Those are not a new phone menu.
    const fresh = this.input.slice(this.boundary);
    if (HUMAN_GREETING.some((re) => re.test(fresh)) || lastMatch(fresh, WAIT_OR_PERSON) > lastMatch(fresh, MENU)) {
      this.personSpeaking = true;
      this.menuContext = '';
      this.boundary = this.input.length;
      this.callerBoundary = this.callerInput.length;
      return;
    }
    // Still the prompt the last key answered: it belongs to that press, not to a new menu.
    const last = this.attempts.at(-1);
    if (last && at - last.at < KEY_TRANSCRIPT_LAG_MS && last.inputEnd >= this.boundary) {
      last.inputEnd = this.input.length;
      this.boundary = this.input.length;
    }
  }

  observeCaller(delta: string, at: number): void {
    this.callerInput += delta;
    this.callerAt = at;
  }

  snapshot(): MenuSnapshot {
    return { text: this.input.slice(this.boundary).trim(), end: this.input.length, at: this.at, callerEnd: this.callerInput.length };
  }

  /** Fresh input offering keypad options or rejecting a choice, not yet answered or handed to a person. */
  private openMenu(snapshot: MenuSnapshot): (MissedHandoff & { snapshot: MenuSnapshot }) | null {
    const menu = lastMatch(snapshot.text, this.personSpeaking || WEB_ENTRY.test(snapshot.text) ? KEYPAD_MENU : MENU);
    const failure = this.menuContext && !this.personSpeaking ? lastMatch(snapshot.text, MENU_FAILURE) : -1;
    if (Math.max(menu, failure) < 0 || lastMatch(snapshot.text, WAIT_OR_PERSON) > Math.max(menu, failure)) return null;
    if (failure < menu && recordingControl(snapshot.text, menu)) return null;
    return { reason: failure > menu ? 'menu_recovery' : 'menu', line: { role: 'them', text: snapshot.text, at: snapshot.at }, snapshot };
  }

  /** A keypad menu is waiting on its choice. */
  awaitingKey(): boolean {
    return this.openMenu(this.snapshot()) !== null;
  }

  /** The line has offered keypad options since a person last spoke: it is a phone menu. */
  heardMenu(): boolean {
    return (Boolean(this.menuContext) && !this.personSpeaking) || this.awaitingKey();
  }

  pending(): (MissedHandoff & { snapshot: MenuSnapshot }) | null {
    const snapshot = this.snapshot();
    const menu = this.openMenu(snapshot);
    if (menu) return menu;
    const spoken = this.callerInput.slice(this.callerBoundary).trim();
    const digits = spokenKeypadDigits(spoken);
    if (!this.menuContext || this.personSpeaking || !digits) return null;
    const last = this.attempts.at(-1);
    // A spoken confirmation arriving after its tool result must not press the same key twice.
    if (last?.digits === digits && snapshot.end <= last.inputEnd) return null;
    return { reason: 'keypad', line: { role: 'caller', text: spoken, at: this.callerAt }, menuContext: this.menuContext, snapshot: { ...snapshot, at: Math.max(snapshot.at, this.callerAt) } };
  }

  checked(snapshot: MenuSnapshot): void {
    // Input may have switched to a person while a keypad request was in flight.
    if (snapshot.end < this.boundary) return;
    if (lastMatch(snapshot.text, MENU) >= 0) this.menuContext = snapshot.text;
    if (lastMatch(snapshot.text, KEYPAD_MENU) >= 0) this.personSpeaking = false;
    this.boundary = Math.max(this.boundary, snapshot.end);
    this.callerBoundary = Math.max(this.callerBoundary, snapshot.callerEnd);
  }

  /** The same keys again with nothing new heard since they went in: a duplicate, not a fresh choice. */
  repeats(digits: string): boolean {
    const last = this.attempts.at(-1);
    return last?.digits === digits && this.input.length <= last.inputEnd;
  }

  /** Call only after the carrier accepts DTMF, consuming input from before submission. */
  submitted(digits: string, snapshot: MenuSnapshot, at: number): void {
    this.attempts.push({ digits, prompt: snapshot.text || this.menuContext, inputEnd: snapshot.end, at });
    this.checked(snapshot);
    if (spokenKeypadDigits(this.callerInput.slice(this.callerBoundary)) === digits) this.callerBoundary = this.callerInput.length;
  }

  history(): string {
    return this.attempts.slice(-8).map((attempt, i) => `${i + 1}. Keypad submitted: ${attempt.digits}. Prompt: ${attempt.prompt.slice(-600)}`).join('\n') || '(no keypad input has been submitted)';
  }
}

/**
 * The caller's latest promise, with no delegation since it started and not already forced.
 * MenuRecovery handles menus independently of transcript timestamps and delegation events.
 */
export function missedHandoff(lines: TranscriptLine[], lastHandoffAt: number, forced: ReadonlySet<number>): MissedHandoff | null {
  // Their "buenas noches" after our caller's "bye" still leaves that goodbye unhandled: look past it.
  // So does a goodbye they keep talking after ("Cool. Bye. The call is not ended..."): the back
  // office reads what followed and either hangs up or answers it.
  let i = lines.length - 1;
  while (i >= 0 && (lines[i].role === 'note' || (lines[i].role === 'them' && (CLOSING.test(lines[i].text.trim()) || OPENS_WITH_GOODBYE.test(lines[i].text))))) i--;
  const last = lines[i];
  if (!last) return null;
  if (last.role === 'caller' && (promisesAction(last.text) || greekGoodbye(lines, i)) && last.at > lastHandoffAt && !forced.has(last.at)) return { reason: 'promise', line: last };
  return null;
}

/**
 * The caller has left its message on voicemail: the latest line is ours, spoken after the beep (or
 * after the greeting asked for a message), and the line has gone quiet. A message ending "thank you!" has no goodbye for missedHandoff to see, and
 * an unhung voicemail bills every silent minute up to the cap.
 */
export function voicemailLeft(lines: TranscriptLine[], beepAt: number | null, forced: ReadonlySet<number>): MissedHandoff | null {
  // Recording starts at the carrier's beep or, when it heard none, the greeting's own "leave a message".
  // A menu option ("to leave a message, press 3") is not a recording starting.
  const prompt = messagePrompt(lines);
  const recordingFrom = beepAt ?? prompt?.at ?? null;
  if (recordingFrom === null) return null;
  if (prompt && pickedUpAfter(lines, prompt)) return null;
  let i = lines.length - 1;
  while (i >= 0 && lines[i].role === 'note') i--;
  const last = lines[i];
  if (!last || last.role !== 'caller' || last.at < recordingFrom || forced.has(last.at)) return null;
  // A message, not the "Hi!" it starts with; transcripts split it across lines between greeting fragments.
  const words = lines.filter((l) => l.role === 'caller' && l.at >= recordingFrom).reduce((n, l) => n + l.text.trim().split(/\s+/).filter(Boolean).length, 0);
  return words >= MESSAGE_WORDS ? { reason: 'voicemail_left', line: last } : null;
}
/** Fewer words than this from our caller are its "Hi!" or "Hmm.", not a message. */
const MESSAGE_WORDS = 4;

/**
 * A message left after a greeting that asked for one, on a line the carrier never flagged: the
 * greeting is the other side's last word, and only our caller has spoken since. A person who asks
 * for a message mid-call keeps talking, so an earlier "leave a message" never counts.
 */
export function messageAfterGreeting(lines: TranscriptLine[], forced: ReadonlySet<number>): MissedHandoff | null {
  const theirs = lines.filter((l) => l.role === 'them');
  const last = theirs.length - 1;
  return last >= 0 && (asksForMessage(theirs[last].text) || asksForMessage(greetingUpTo(theirs, last))) ? voicemailLeft(lines, null, forced) : null;
}

/**
 * A voicemail greeting asked for a message, went quiet, and our caller has not left one: the
 * recording has started even though no beep was detected. Gamrat Lalonde's French greeting
 * ("veuillez laisser un message après le signal sonore") never beeped for the carrier, and the
 * caller sat silent 50s, said "j'attends le bip", until the voicemail gave up on an empty message.
 * A few words from our caller ("Hmm.") are not a message. Asked once per greeting.
 */
export function greetingWaiting(lines: TranscriptLine[], forced: ReadonlySet<number>): MissedHandoff | null {
  const prompt = messagePrompt(lines);
  // A queue can offer voicemail and keep us waiting ("leave a message after the tone, or stay on
  // the line"); a hold request before the offer is over once it comes ("Please stay on the line.
  // I'm sorry, this person is not available. If you would like to leave an additional message...").
  if (!prompt || forced.has(prompt.at) || pickedUpAfter(lines, prompt) || HOLD_REQUEST.test(afterAsk(lines, prompt))) return null;
  const words = lines.filter((l) => l.role === 'caller' && l.at >= prompt.at).reduce((n, l) => n + l.text.trim().split(/\s+/).filter(Boolean).length, 0);
  return words < MESSAGE_WORDS ? { reason: 'greeting_waiting', line: prompt } : null;
}

/**
 * Their words up to line i, with the few lines before it: a greeting streams in fragments
 * ("please leave" / "a" / "message after the" / "tone"), and no one fragment asks for a message.
 */
const GREETING_FRAGMENTS = 4;
function greetingUpTo(theirs: TranscriptLine[], i: number): string {
  return theirs.slice(Math.max(0, i - GREETING_FRAGMENTS + 1), i + 1).map((l) => l.text.trim()).join(' ');
}

/**
 * Their line where the latest request for a message is complete, carrying the greeting text it
 * finishes. A line asking on its own comes first: joining pulls an earlier "press four" in, and a
 * menu never asks. Recording starts where the request is first complete, not at the greeting's
 * last fragment: "call you back. Thank" / "you" can land after our message has begun.
 */
function messagePrompt(lines: TranscriptLine[]): TranscriptLine | undefined {
  const theirs = lines.filter((l) => l.role === 'them');
  const asks = (i: number) => asksForMessage(theirs[i].text) || asksForMessage(greetingUpTo(theirs, i));
  let i = theirs.length - 1;
  while (i >= 0 && !asks(i)) i--;
  if (i < 0) return undefined;
  while (i > 0 && asks(i - 1)) i--;
  return asksForMessage(theirs[i].text) ? theirs[i] : { ...theirs[i], text: greetingUpTo(theirs, i) };
}

/**
 * Someone picked up after the greeting asked for a message: forwarded lines ring a person while
 * the voicemail plays, and a receptionist's "Good afternoon, Haileybury Beach Motel, how can I help
 * you" ran on in the same line as "at the tone, please record your message". Counting that as a
 * message left hung up on her mid-sentence. Only what follows the prompt counts: voicemail
 * greetings say "thanks for calling" before it.
 */
function pickedUpAfter(lines: TranscriptLine[], prompt: TranscriptLine): boolean {
  return PICKED_UP.test(afterAsk(lines, prompt));
}

/** What they said after the prompt's last request for a message. */
function afterAsk(lines: TranscriptLine[], prompt: TranscriptLine): string {
  const ask = [...prompt.text.matchAll(new RegExp(VOICEMAIL_PROMPT.source, 'gi'))].pop();
  return [prompt.text.slice(ask ? ask.index! + ask[0].length : 0), ...lines.filter((l) => l.role === 'them' && l.at > prompt.at).map((l) => l.text)].join(' ');
}

/** A person answering the phone, as opposed to a greeting that is still recording. */
const PICKED_UP = /\b(?:how (?:else )?(?:can|may) (?:i|we) (?:help|assist)|what can (?:i|we) do for you|(?<!have a |a very |enjoy your )good (?:morning|afternoon|evening)|(?:this is|it'?s) \w+(?: \w+)? speaking|en qu[eé] (?:le|lo|la) (?:puedo|podemos) (?:ayudar|servir)|comment (?:puis-je|pouvons-nous|est-ce que je peux) vous aider|en quoi (?:puis-je|pouvons-nous) vous aider|buen(?:os d[ií]as|as tardes|as noches))\b/i;

/**
 * A greeting asking for a message, not a menu option for one ("to leave a message, press 3"). Only
 * the sentence asking is judged: the recording's own controls follow it ("At the tone, please
 * record your message. When you have finished recording, you may hang up or press one for more
 * options"), and reading those as a menu held One Jackson Place's voicemail open 46s.
 */
export function asksForMessage(text: string): boolean {
  return sentences(text).some((sentence) => {
    const clause = requestClause(sentence);
    return clause !== null && !isPhoneMenu(clause) && !SPOKEN_MESSAGE_OPTION.test(clause);
  });
}

/**
 * The part of a sentence that asks for a message, from the menu option before it: a transcript
 * can run a whole menu and the voicemail it transfers to together with no full stop ("...To
 * return to the previous menu, press the pound key Please wait while your call is being
 * transferred Please leave a message after the tone"), and judged whole that read as a menu,
 * so Episcopal Community Services' voicemail held a silent line 5 minutes. An option's own
 * "press 1 to leave a message" keeps the option with it.
 */
function requestClause(sentence: string): string | null {
  const ask = sentence.search(VOICEMAIL_PROMPT);
  if (ask < 0) return null;
  let from = 0;
  for (const key of sentence.slice(0, ask).matchAll(KEY_PRESS)) from = key.index! + key[0].length;
  return from && !OPTION_BOUND.test(sentence.slice(from, ask)) ? sentence.slice(from) : sentence;
}
const KEY_PRESS = new RegExp(String.raw`\b(?:press(?:ing)?|dial)\s+(?:the\s+)?${KEY}(?:\s+(?:key|button|sign))?(?!\w)`, 'gi');
/**
 * Words between a key and the request that keep the request in its option: "press 1 to leave a
 * message", "press 2, or if…", "press the star key at any time to leave a voicemail".
 */
const OPTION_BOUND = /^[\s,;:–-]*(?:to|for|or|and|if|when|now)\b|\b(?:to|for|or|and)\s*$/i;

/**
 * Its sentences, with one opening "and"/"or" kept on the sentence before: transcripts cut a menu
 * option in two ("…simply press zero. And leave us a message with the best way to reach you.").
 */
function sentences(text: string): string[] {
  return text.trim().split(SENTENCE_END).reduce<string[]>((all, s) => (all.length && /^(?:and|or)\b/i.test(s) ? [...all.slice(0, -1), `${all.at(-1)} ${s}`] : [...all, s]), []);
}

/** A spoken menu's option for a message: "for anything else, say contact to leave a message for our community team". */
const SPOKEN_MESSAGE_OPTION = /\bsay\b[^.?!]{0,40}\bto (?:leave|record)\b|\bto (?:leave|record)\b[^.?!]{0,60}\bsay\b/i;

/** A greeting asking for a message: where a voicemail starts recording when the carrier hears no beep. */
// "Leave me a name or a number", "leave us a voicemail", "leave your name, date of birth, and reason
// for your call", "leave full name, date of birth, best contact number": asking for a name is
// asking for a message. So is an AI receptionist's "please provide your name and a brief message".
// Hangul has no \b, so Korean sits outside it. French sits outside it too: an accented last letter
// ("tonalité") is no word character, so \b after it never matches. "Pour laisser un message" and
// "para dejar un mensaje" lead into a menu option ("..., appuyez sur le 3"), not a request.
const VOICEMAIL_PROMPT = /삐\s?소리\s?(?:후|가 나면)|메시지를\s?(?:녹음|남겨)|\b(?<!\bpour (?:nous |me )?)(?:laiss(?:er|ez)(?:-(?:nous|moi)| (?:nous|moi))? (?:(?:un |votre )?(?:bref |court |petit )?message|vos coordonn[ée]es|votre nom)|apr[eè]s (?:le (?:signal(?: sonore)?|bip|top(?: sonore)?)|la tonalit[ée])|au (?:signal sonore|bip)|enregistr(?:er|ez) votre message)(?![\wÀ-ÿ])|\b(?:leave (?:me |us )?(?:a |an |your )?(?:brief |short |quick |detailed |additional )?(?:message|voice ?mail|(?:full |first and last )?name)|(?:provide|state) your name and (?:a |your )?(?:brief |short )?message|(?:after|at) the (?:tone|beep)|record your message|(?<!\bpara )d[eé]ja(?:r|me)? (?:un|su) mensaje|d[eé]je(?:me)? (?:un|su) mensaje|despu[eé]s del tono|nach dem (?:signalton|piepton|ton)|hinterlass(?:en sie|e) (?:mir )?(?:eine|ihre) nachricht)\b/i;

/**
 * The caller asked to be called, texted or emailed back and nobody answered: a voicemail the carrier
 * never flagged and whose greeting was never transcribed. Across past calls, a person always
 * answered such a message within ~26s; voicemails recorded silence for minutes, until "you have
 * exceeded maximum voicemail duration". The session asks only after UNANSWERED_MS of silence.
 */
export function messageUnanswered(lines: TranscriptLine[], forced: ReadonlySet<number>): MissedHandoff | null {
  let i = lines.length - 1;
  while (i >= 0 && lines[i].role === 'note') i--;
  const last = lines[i];
  if (!last || last.role !== 'caller' || forced.has(last.at)) return null;
  let k = i;
  while (k > 0 && lines[k - 1].role !== 'them') k--;
  const message = lines.slice(k, i + 1).filter((l) => l.role === 'caller').map((l) => l.text).join(' ');
  // A question is put to a person, who may be quietly looking it up: "can you confirm whether…?".
  if (message.trim().endsWith('?')) return null;
  return message.trim().split(/\s+/).length >= 8 && CALLBACK_REQUEST.test(message) ? { reason: 'voicemail_left', line: last } : null;
}

/**
 * A recording that said goodbye ("…through the Help section of your app. Goodbye") and left the
 * line open. The session asks only after UNANSWERED_MS of silence, so a person's goodbye has long
 * since been answered or hung up.
 */
export function signedOff(lines: TranscriptLine[], forced: ReadonlySet<number>): MissedHandoff | null {
  let i = lines.length - 1;
  while (i >= 0 && lines[i].role === 'note') i--;
  const last = lines[i];
  if (!last || last.role !== 'them' || forced.has(last.at)) return null;
  return /\b(?:good-?bye|adi[oó]s|auf wiedersehen|tsch[uü]ss)\W*$/i.test(last.text.trim()) ? { reason: 'signed_off', line: last } : null;
}

/** "Please call back at…", "text Michael at four one five…": what a voicemail message asks for. */
const CALLBACK_REQUEST = /\b(?:call (?:me|him|her|us|them) back|call back|callback number|text (?:me|him|her|us|them)|email (?:me|him|her|us|them)|reply (?:by|to|at)|reach (?:(?:me|him|her|us|them) )?(?:back )?at|(?:call|text)(?: or (?:call|text))? \w+ at|please call (?:\d|zero|one|two|three|four|five|six|seven|eight|nine)|give (?:me|him|her|us|them) a call|(?:my|his|her|our|the) (?:callback )?number is|devu[eé]lva(?:me|nos)? la llamada|ll[aá]me(?:me|nos)? (?:al|a)|(?:me|nos) (?:puede|podr[ií]a) llamar|r[uü]ckruf|ruf (?:mich|uns) (?:zur[uü]ck|an))\b/i;

/** What the back office is told when the session starts it because the voice model didn't. */
export function forcedHandoffMessage(miss: MissedHandoff, lines: TranscriptLine[], keypadHistory = '(no keypad input has been submitted)'): string {
  const recent = lines
    .slice(-8)
    .map((l) => `${l.role}: ${l.text.trim()}`)
    .join('\n');
  const what =
    miss.reason === 'keypad'
      ? `The caller announced a keypad action but no matching keypad submission followed. Speaking a key does not press it. Use press_digits if the announced action is still needed and supported by the task and the menu. Do not repeat a key already submitted or speak an acknowledgment. Stay silent while a person speaks or during hold.\n\nCaller's unfulfilled keypad action:\n${miss.line.text}\n\nActive menu instructions:\n${miss.menuContext}\n\nKeypad history (carrier accepted these requests; navigation may still have failed):\n${keypadHistory}`
      : miss.reason === 'voicemail_left'
      ? 'The caller has left its voicemail message after the beep. The call is done: hand off end_call now, and write nothing.'
      : miss.reason === 'greeting_waiting'
      ? "The voicemail greeting asked for a message and the line has been quiet since, so it is recording now, even though no beep was reported. Leave your message now, in the greeting's language: one or two sentences saying who you are, what it's about, and the callback number. Then hand off end_call."
      : miss.reason === 'signed_off'
      ? 'The other side said goodbye and the line has been silent since. The call is done: hand off end_call now, and write nothing.'
      : miss.reason !== 'promise'
      ? `The latest phone menu needs attention. ${miss.reason === 'menu_recovery' ? 'It reported missing/invalid input or led to recorded instructions instead of completing the task.' : 'Choose from the fully heard options.'} Use press_digits for an announced option that serves the task or reaches a person. Wait if the options are incomplete. If a choice led to instructions only, use an announced back/main-menu option, then another relevant route such as other questions or a representative. Never assume 0, star or pound works when it was not offered. Do not repeat an unsuccessful route unchanged. Stay silent on hold or while a person speaks. A voicemail after a message was left needs end_call; at its review menu (save, listen, re-record), press the save key, never re-record. If there is no supported route left, ask_user or end_call according to the brief.\n\nFresh menu input:\n${miss.line.text}\n\nKeypad history (carrier accepted these requests; navigation may still have failed):\n${keypadHistory}`
      : 'The caller said it would do something but never handed it off. Do it now: if they asked for something the caller does not have, ask_user; if the call is over, end_call; if a menu needs a key, press_digits.';
  return `${what} If nothing is actually needed, write nothing.

Latest conversation:
${recent}`;
}

/**
 * A question is out to the person and the line has gone quiet with someone waiting on us. GPT-Live
 * only speaks when it hears something, so without this it sits silent until the answer lands
 * (Spectrum heard 41s of nothing after "Already sent" while a one-time code came back). The line has to
 * fit the question: told to say "Is there another way to look it up?", the caller said it twice to a
 * rep waiting for Jeremy to rescan a QR code, the second time a minute later.
 */
export function holdingLineMessage(question: string, owner: string): string {
  return `You're waiting on ${owner}'s answer to: "${question.slice(0, 300)}". The line has gone quiet and they're waiting on you. Right now, say one short casual line that fits what you're waiting for: if it's a detail they could find another way, say you don't have it yet and ask if there's another way to look it up; if ${owner} is trying something or checking something, say you're still waiting on them. This is for this moment only: after you've said it, don't say it again. Carry on with anything else you can accomplish using the facts you have. Don't make up the answer.`;
}

/**
 * When the user asked to be patched in on a condition ("as soon as a person picks up"), the
 * back office checks each time the other side finishes speaking, rather than trusting the voice
 * model to notice.
 */
export function connectCheckMessage(connectWhen: string, owner: string, lines: TranscriptLine[]): string {
  const recent = lines
    .slice(-6)
    .map((l) => `${l.role}: ${l.text.trim()}`)
    .join('\n');
  return `${owner} asked to be patched into this call: ${connectWhen}. If the latest conversation meets that condition, connect_person now. Otherwise write nothing.

Latest conversation:
${recent}`;
}
