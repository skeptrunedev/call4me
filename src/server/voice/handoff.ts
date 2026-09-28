import type { TranscriptLine } from '../services/calls';

/**
 * GPT-Live decides on its own when to hand work to the back office, and sometimes it says the
 * hand-off out loud ("2.", "let me check on that real quick", "bye!") without ever delegating:
 * no delegation event, no error, nothing runs. A phone menu only hears the keypad, so a spoken
 * "2" loops the menu forever. The session watches the transcript for these moments and starts
 * the back office itself (response.item.create + response.create) when no hand-off follows.
 */

const KEY = String.raw`(?:\d|one|two|three|four|five|six|seven|eight|nine|zero|pound|star|hash)`;
const MENU = [
  new RegExp(String.raw`\bpress(?:ing)?\s+${KEY}\b`, 'i'),
  new RegExp(String.raw`\bdial\s+${KEY}\b`, 'i'),
  /\b(?:enter|type|key in)\b[^.?!]{0,60}\b(?:keypad|followed by (?:the )?(?:pound|hash|star))\b/i,
  /\bmenu options\b/i,
];

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

export type MissedHandoff = { reason: 'menu' | 'promise'; line: TranscriptLine };

/**
 * The hand-off the voice model should have made, if any: the latest phone menu, or the caller's
 * latest promise, with no delegation since it started and not already forced.
 */
export function missedHandoff(lines: TranscriptLine[], lastHandoffAt: number, forced: ReadonlySet<number>): MissedHandoff | null {
  const last = lines[lines.length - 1];
  if (!last) return null;
  // The menu is their latest line, even if the caller has since spoken over it ("2.").
  const them = last.role === 'them' ? last : lines[lines.length - 2];
  if (them?.role === 'them' && isPhoneMenu(them.text) && them.at > lastHandoffAt && !forced.has(them.at)) return { reason: 'menu', line: them };
  if (last.role === 'caller' && promisesAction(last.text) && last.at > lastHandoffAt && !forced.has(last.at)) return { reason: 'promise', line: last };
  return null;
}

/** What the back office is told when the session starts it because the voice model didn't. */
export function forcedHandoffMessage(miss: MissedHandoff, lines: TranscriptLine[]): string {
  const recent = lines
    .slice(-8)
    .map((l) => `${l.role}: ${l.text.trim()}`)
    .join('\n');
  const what =
    miss.reason === 'menu'
      ? 'A phone menu is playing and nothing was pressed (menus only hear the keypad). Press the digits for the option that best serves the task, or reaches a person (press_digits). If the menu is a voicemail system after a message was left, end_call.'
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
