import type { TranscriptLine } from '../services/calls';

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

const HOLD_REQUEST = /\b(?:please hold|on hold|hold on|hold time|wait time|next available|in (?:the )?queue|caller number|hang on|bear with me|stay on the line|remain on the line|(?:one|just a|give me a) (?:sec(?:ond)?|moment|minute)|let me (?:check|see|look|pull)|(?:being )?transferr?(?:ed|ing)|un moment(?:o|ito)|espere|perm[ií]tame|d[eé]jeme (?:verificar|ver|revisar|buscar)|en espera|permanezca en (?:la )?l[ií]nea|le (?:transfiero|comunico|estamos transfiriendo))\b/i;

/**
 * The other side's latest sentence asked us to wait (a hold, a transfer, "let me check"), so any
 * quiet that follows is theirs to break, not ours.
 */
export function asksUsToWait(text: string): boolean {
  const sentences = text.trim().split(/[.?!]+\s+/);
  return HOLD_REQUEST.test(sentences[sentences.length - 1] ?? '');
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
];

/** The other side only closing the call after our caller's goodbye: "you too", "de nada", "buenas noches". */
const CLOSING = /^[\s,.!]*(?:(?:ok(?:ay)?|alright|all right|thanks?|thank you|you too|same to you|bye(?:[- ]bye)?|goodbye|good ?night|have a (?:good|great|nice|wonderful) (?:one|day|night|evening)|take care|you'?re welcome|no problem|mhm|mm-?hmm|de nada|gracias|igualmente|buenas noches|buen d[ií]a|adi[oó]s|hasta luego|chao)[\s,.!]*)+$/i;

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

export type MissedHandoff = { reason: 'menu' | 'menu_recovery' | 'keypad' | 'promise' | 'voicemail_left' | 'signed_off'; line: TranscriptLine; menuContext?: string };
type MenuSnapshot = { text: string; end: number; at: number; callerEnd: number };
type KeypadAttempt = { digits: string; prompt: string; inputEnd: number };

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
  submitted(digits: string, snapshot: MenuSnapshot): void {
    this.attempts.push({ digits, prompt: snapshot.text || this.menuContext, inputEnd: snapshot.end });
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
  let i = lines.length - 1;
  while (i >= 0 && (lines[i].role === 'note' || (lines[i].role === 'them' && CLOSING.test(lines[i].text.trim())))) i--;
  const last = lines[i];
  if (!last) return null;
  if (last.role === 'caller' && promisesAction(last.text) && last.at > lastHandoffAt && !forced.has(last.at)) return { reason: 'promise', line: last };
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
  const prompt = [...lines].reverse().find((l) => l.role === 'them' && asksForMessage(l.text));
  const recordingFrom = beepAt ?? prompt?.at ?? null;
  if (recordingFrom === null) return null;
  if (prompt && pickedUpAfter(lines, prompt)) return null;
  let i = lines.length - 1;
  while (i >= 0 && lines[i].role === 'note') i--;
  const last = lines[i];
  if (!last || last.role !== 'caller' || last.at < recordingFrom || forced.has(last.at)) return null;
  // A message, not the "Hi!" it starts with; transcripts split it across lines between greeting fragments.
  const words = lines.filter((l) => l.role === 'caller' && l.at >= recordingFrom).reduce((n, l) => n + l.text.trim().split(/\s+/).filter(Boolean).length, 0);
  return words >= 4 ? { reason: 'voicemail_left', line: last } : null;
}

/**
 * A message left after a greeting that asked for one, on a line the carrier never flagged: the
 * greeting is the other side's last word, and only our caller has spoken since. A person who asks
 * for a message mid-call keeps talking, so an earlier "leave a message" never counts.
 */
export function messageAfterGreeting(lines: TranscriptLine[], forced: ReadonlySet<number>): MissedHandoff | null {
  const theirs = lines.filter((l) => l.role === 'them');
  const greeting = theirs[theirs.length - 1];
  return greeting && asksForMessage(greeting.text) ? voicemailLeft(lines, null, forced) : null;
}

/**
 * Someone picked up after the greeting asked for a message: forwarded lines ring a person while
 * the voicemail plays, and a receptionist's "Good afternoon, Haileybury Beach Motel, how can I help
 * you" ran on in the same line as "at the tone, please record your message". Counting that as a
 * message left hung up on her mid-sentence. Only what follows the prompt counts: voicemail
 * greetings say "thanks for calling" before it.
 */
function pickedUpAfter(lines: TranscriptLine[], prompt: TranscriptLine): boolean {
  const ask = [...prompt.text.matchAll(new RegExp(VOICEMAIL_PROMPT.source, 'gi'))].pop();
  const after = [prompt.text.slice(ask ? ask.index! + ask[0].length : 0), ...lines.filter((l) => l.role === 'them' && l.at > prompt.at).map((l) => l.text)].join(' ');
  return PICKED_UP.test(after);
}

/** A person answering the phone, as opposed to a greeting that is still recording. */
const PICKED_UP = /\b(?:how (?:can|may) (?:i|we) (?:help|assist)|what can (?:i|we) do for you|(?<!have a |a very |enjoy your )good (?:morning|afternoon|evening)|(?:this is|it'?s) \w+(?: \w+)? speaking|en qu[eé] (?:le|lo|la) (?:puedo|podemos) (?:ayudar|servir)|buen(?:os d[ií]as|as tardes|as noches))\b/i;

/** A greeting asking for a message, not a menu option for one ("to leave a message, press 3"). */
export function asksForMessage(text: string): boolean {
  return VOICEMAIL_PROMPT.test(text) && !isPhoneMenu(text);
}

/** A greeting asking for a message: where a voicemail starts recording when the carrier hears no beep. */
const VOICEMAIL_PROMPT = /\b(?:leave (?:me |us )?(?:a|your) (?:brief |short |quick |detailed )?(?:message|name,? (?:and |& )?(?:your )?(?:(?:phone|telephone|contact|callback|call ?back) )?number)|(?:after|at) the (?:tone|beep)|record your message|d[eé]ja(?:r|me)? (?:un|su) mensaje|d[eé]je(?:me)? (?:un|su) mensaje|despu[eé]s del tono|nach dem (?:signalton|piepton|ton)|hinterlass(?:en sie|e) (?:mir )?(?:eine|ihre) nachricht)\b/i;

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
      : miss.reason === 'signed_off'
      ? 'The other side said goodbye and the line has been silent since. The call is done: hand off end_call now, and write nothing.'
      : miss.reason !== 'promise'
      ? `The latest phone menu needs attention. ${miss.reason === 'menu_recovery' ? 'It reported missing/invalid input or led to recorded instructions instead of completing the task.' : 'Choose from the fully heard options.'} Use press_digits for an announced option that serves the task or reaches a person. Wait if the options are incomplete. If a choice led to instructions only, use an announced back/main-menu option, then another relevant route such as other questions or a representative. Never assume 0, star or pound works when it was not offered. Do not repeat an unsuccessful route unchanged. Stay silent on hold or while a person speaks. A voicemail after a message was left needs end_call. If there is no supported route left, ask_user or end_call according to the brief.\n\nFresh menu input:\n${miss.line.text}\n\nKeypad history (carrier accepted these requests; navigation may still have failed):\n${keypadHistory}`
      : 'The caller said it would do something but never handed it off. Do it now: if they asked for something the caller does not have, ask_user; if the call is over, end_call; if a menu needs a key, press_digits.';
  return `${what} If nothing is actually needed, write nothing.

Latest conversation:
${recent}`;
}

/**
 * A question is out to the person and the line has gone quiet with someone waiting on us. GPT-Live
 * only speaks when it hears something, so without this it sits silent until the answer lands
 * (Spectrum heard 41s of nothing after "Already sent" while a one-time code came back).
 */
export function holdingLineMessage(question: string, owner: string): string {
  return `You're waiting on ${owner}'s answer to: "${question.slice(0, 300)}". The line has gone quiet and they're waiting on you. Say one short casual line like "I don't have that detail yet. Is there another way to look it up?" Only ask this once. Carry on with anything else you can accomplish using the facts you have. Don't make up the answer or repeat that you're waiting.`;
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
