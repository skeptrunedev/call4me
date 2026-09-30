import type { TranscriptLine } from '../services/calls';

/**
 * GPT-Live decides on its own when to hand work to the back office, and sometimes it says the
 * hand-off out loud ("2.", "let me check on that real quick", "bye!") without ever delegating:
 * no delegation event, no error, nothing runs. A phone menu only hears the keypad, so a spoken
 * "2" loops the menu forever. The session watches the transcript for these moments and starts
 * the back office itself (response.item.create + response.create) when no hand-off follows.
 */

const KEY = String.raw`(?:\d|one|two|three|four|five|six|seven|eight|nine|zero|pound|star|hash)`;
const KEYPAD_MENU = [
  new RegExp(String.raw`\bpress(?:ing)?\s+${KEY}\b`, 'i'),
  new RegExp(String.raw`\bdial\s+${KEY}\b`, 'i'),
  /\b(?:enter|type|key in)\b[^.?!]{0,60}\b(?:keypad|followed by (?:the )?(?:pound|hash|star))\b/i,
  /\bmenu options\b/i,
  /\bappuyez\b[^.?!]{0,30}\b(?:sur|le)\b/i,
  /\bcomposez\b[^.?!]{0,40}\b(?:zéro|zero|un|deux|trois|quatre|cinq|six|sept|huit|neuf|\d)\b/i,
];
const ENTER_NUMBER = /\b(?:please )?enter\b[^.?!]{0,60}\b(?:order|account|extension|pin|code|number)\b/i;
const WEB_ENTRY = /\b(?:website|web site|browser|online|form)\b/i;
const MENU = [...KEYPAD_MENU, ENTER_NUMBER];

/** A recording offering keypad choices, or asking for keypad input. */
export function isPhoneMenu(text: string): boolean {
  return MENU.some((re) => re.test(text));
}

const PROMISES = [
  /\b(?:let me|lemme) (?:check|see|look|find out)\b/i,
  /\b(?:one|just a) (?:sec(?:ond)?|moment|minute)\b/i,
  /\bhang on\b/i,
  /\bi'?ll (?:check|find out|ask)\b/i,
  /\b(?:good)?bye\b/i,
  /\bhave a (?:good|great|nice|wonderful) (?:one|day|night|evening|afternoon|weekend)\b/i,
];

/** The caller said it would go do something (look something up, hang up) that needs the back office. */
export function promisesAction(text: string): boolean {
  return PROMISES.some((re) => re.test(text));
}

const MENU_FAILURE = [
  /\bno (?:input|selection|entry|response) (?:was )?received\b/i,
  /\b(?:did not|didn't|haven't|have not) receive (?:your |an? )?(?:input|selection|entry|response)\b/i,
  /\b(?:entry|selection|input) (?:is |was )?(?:invalid|not (?:recognized|recognised|valid))\b/i,
  /\b(?:don't|do not|didn't|did not) (?:recognize|recognise) (?:that|your) (?:entry|selection|input)\b/i,
  /\b(?:exceeded|maximum number of) (?:the )?(?:maximum number of )?attempts\b/i,
  /\bif this (?:has )?answered your question\b/i,
  /\b(?:return|visit|go to|click on)\b[^.?!]{0,100}\b(?:warehouse|website|web site|customer service page|return or replace)\b/i,
];
const HUMAN_GREETING = /(?:^|[.!?\n])\s*(?:my name is\b|how (?:can|may) i (?:help|assist)\b|thank you for (?:holding|waiting)\b)/i;
const WAIT_OR_PERSON = [
  /\b(?:please (?:hold|stay on the line)|on hold|all (?:our )?representatives are busy|call (?:is )?being transferred)\b/i,
  /(?:^|[.!?\n])\s*(?:hello\b|hi\b|my name is\b|how (?:can|may) i (?:help|assist)\b|thank you for (?:holding|waiting)\b)/i,
];

function lastMatch(text: string, patterns: RegExp[]): number {
  let index = -1;
  for (const pattern of patterns) {
    for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) index = Math.max(index, match.index);
  }
  return index;
}

export type MissedHandoff = { reason: 'menu' | 'menu_recovery' | 'promise'; line: TranscriptLine };
type MenuSnapshot = { text: string; end: number; at: number };
type KeypadAttempt = { digits: string; prompt: string };

/** Fresh IVR input is tracked separately: a transcript line can span several menus. */
export class MenuRecovery {
  private input = '';
  private boundary = 0;
  private at = 0;
  private menuContext = '';
  private personSpeaking = false;
  private attempts: KeypadAttempt[] = [];

  observe(delta: string, at: number): void {
    this.input += delta;
    this.at = at;
    // A person can give website instructions too. Those are not a new phone menu.
    if (HUMAN_GREETING.test(this.input.slice(this.boundary))) {
      this.personSpeaking = true;
      this.menuContext = '';
      this.boundary = this.input.length;
    }
  }

  snapshot(): MenuSnapshot {
    return { text: this.input.slice(this.boundary).trim(), end: this.input.length, at: this.at };
  }

  pending(): (MissedHandoff & { snapshot: MenuSnapshot }) | null {
    const snapshot = this.snapshot();
    const menu = lastMatch(snapshot.text, this.personSpeaking || WEB_ENTRY.test(snapshot.text) ? KEYPAD_MENU : MENU);
    const failure = this.menuContext && !this.personSpeaking ? lastMatch(snapshot.text, MENU_FAILURE) : -1;
    if (Math.max(menu, failure) < 0 || lastMatch(snapshot.text, WAIT_OR_PERSON) > Math.max(menu, failure)) return null;
    return { reason: failure > menu ? 'menu_recovery' : 'menu', line: { role: 'them', text: snapshot.text, at: snapshot.at }, snapshot };
  }

  checked(snapshot: MenuSnapshot): void {
    // Input may have switched to a person while a keypad request was in flight.
    if (snapshot.end < this.boundary) return;
    if (snapshot.text) this.menuContext = snapshot.text;
    if (lastMatch(snapshot.text, KEYPAD_MENU) >= 0) this.personSpeaking = false;
    this.boundary = Math.max(this.boundary, snapshot.end);
  }

  /** Call only after the carrier accepts DTMF, consuming input from before submission. */
  submitted(digits: string, snapshot: MenuSnapshot): void {
    this.attempts.push({ digits, prompt: snapshot.text || this.menuContext });
    this.checked(snapshot);
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
  const last = lines[lines.length - 1];
  if (!last) return null;
  if (last.role === 'caller' && promisesAction(last.text) && last.at > lastHandoffAt && !forced.has(last.at)) return { reason: 'promise', line: last };
  return null;
}

/** What the back office is told when the session starts it because the voice model didn't. */
export function forcedHandoffMessage(miss: MissedHandoff, lines: TranscriptLine[], keypadHistory = '(no keypad input has been submitted)'): string {
  const recent = lines
    .slice(-8)
    .map((l) => `${l.role}: ${l.text.trim()}`)
    .join('\n');
  const what =
    miss.reason !== 'promise'
      ? `The latest phone menu needs attention. ${miss.reason === 'menu_recovery' ? 'It reported missing/invalid input or led to recorded instructions instead of completing the task.' : 'Choose from the fully heard options.'} Use press_digits for an announced option that serves the task or reaches a person. Wait if the options are incomplete. If a choice led to instructions only, use an announced back/main-menu option, then another relevant route such as other questions or a representative. Never assume 0, star or pound works when it was not offered. Do not repeat an unsuccessful route unchanged. Stay silent on hold or while a person speaks. A voicemail after a message was left needs end_call. If there is no supported route left, ask_user or end_call according to the brief.\n\nFresh menu input:\n${miss.line.text}\n\nKeypad history (carrier accepted these requests; navigation may still have failed):\n${keypadHistory}`
      : 'The caller said it would do something but never handed it off. Do it now: if they asked for something the caller does not have, ask_user; if the call is over, end_call; if a menu needs a key, press_digits.';
  return `${what} If nothing is actually needed, write nothing.

Latest conversation:
${recent}`;
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
