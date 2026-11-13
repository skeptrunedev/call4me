import { asksForMessage } from './handoff';

/**
 * Premium AMD distinguishes a recording beep from an expired detector and an iOS screening
 * prompt. In particular, neither no_beep_detected nor prompt_ended means voicemail is recording.
 * https://developers.telnyx.com/docs/voice/programmable-voice/answering-machine-detection
 */
export type MachineEvent = 'machine' | 'greeting_ended' | 'greeting_timeout' | 'screening_prompt_ended' | 'screening' | 'human';
export type MachineGuidance = 'machine' | 'greeting_ended' | 'greeting_timeout' | 'screening' | 'human';

/** Preserve the carrier's distinction before applying the per-call state below. */
export function machineEventOf(type: string | undefined, result: string | undefined): MachineEvent | null {
  switch (type) {
    case 'call.machine.premium.detection.ended':
      if (result === 'machine') return 'machine';
      return result === 'human_residence' || result === 'human_business' ? 'human' : null;
    case 'call.machine.premium.greeting.ended':
      if (result === 'beep_detected') return 'greeting_ended';
      if (result === 'no_beep_detected') return 'greeting_timeout';
      return result === 'prompt_ended' ? 'screening_prompt_ended' : null;
    case 'call.machine.premium.call_screening.detected':
      return result === 'screening' ? 'screening' : null;
    default:
      return null;
  }
}

/** Stored with the session so repeated delivery after a worker reset cannot restart a greeting. */
export interface MachineState {
  phase: 'unknown' | 'machine' | 'screening' | 'human' | 'voicemail' | 'uncertain';
  occurredAt: number;
  screeningIntroduced: boolean;
}

export const INITIAL_MACHINE_STATE: MachineState = { phase: 'unknown', occurredAt: 0, screeningIntroduced: false };

/**
 * Telnyx can deliver the beep without a preceding machine classification, and screening restarts
 * AMD. Use event time to reject delayed webhooks, not a once-per-call set of classification names.
 * A human result takes precedence over subsequent automated greeting directives for this call.
 */
export function machineTransition(previous: MachineState, event: MachineEvent, occurredAt?: string): { state: MachineState; guidance: MachineGuidance | null } {
  const parsedAt = occurredAt ? Date.parse(occurredAt) : NaN;
  const at = Number.isFinite(parsedAt) ? parsedAt : previous.occurredAt;
  if (event !== 'human' && at < previous.occurredAt) return { state: previous, guidance: null };
  const state = { ...previous, occurredAt: Math.max(at, previous.occurredAt) };
  let guidance: MachineGuidance | null = null;

  if (event === 'human') {
    if (state.phase !== 'unknown' && state.phase !== 'human') guidance = 'human';
    state.phase = 'human';
  } else if (state.phase !== 'human' && state.phase !== 'voicemail') {
    switch (event) {
      case 'machine':
        if (state.phase !== 'machine') guidance = 'machine';
        state.phase = 'machine';
        break;
      case 'greeting_ended':
        state.phase = 'voicemail';
        guidance = 'greeting_ended';
        break;
      case 'greeting_timeout':
        if (state.phase === 'machine') guidance = 'greeting_timeout';
        state.phase = 'uncertain';
        break;
      case 'screening_prompt_ended':
      case 'screening':
        if (!state.screeningIntroduced) guidance = 'screening';
        state.screeningIntroduced = true;
        state.phase = 'screening';
        break;
    }
  }

  return { state, guidance };
}

/**
 * What a call screener says when it wants the caller's introduction: iOS ("record your name and reason
 * for calling, I'll see if this person is available"), Google Voice ("state your name after the tone"),
 * Pixel ("who's calling?"), Google Call Assist ("can you say what you're calling about?"). Telnyx's screening detection also fires on menu greetings, voicemail
 * greetings and people mid-sentence, so the introduction waits for one of these.
 */
const SCREENER_ASK = /\b(?:(?:record|state|say|tell (?:me|us))\b[^.?!]{0,20}\byour name\b|reason for (?:your )?call(?:ing)?|who(?:'s| is) calling|what (?:you(?:'re| are)|are you) calling (?:about|for)|(?:purpose|reason) of (?:your|the|this) call|what (?:this|the|your) call is (?:about|regarding)|call assist|screening service|see if (?:this|the) person(?:'s| is) available|qui[eé]n (?:llama|habla)|(?:diga|grabe) su nombre)/i;
export const screenerAsked = (heard: string) => SCREENER_ASK.test(heard);

/** How far back a screener's question counts: transcription splits it into fragments, and the caller may fill the gap. */
const SCREENER_ASK_WINDOW_MS = 20_000;

/**
 * Whether the other side asked for an introduction in the last few seconds, reading every fragment
 * they said. Reading only the last two lines missed Joe's iPhone screener, transcribed as "If you
 * record your name and reason for calling, I'll" / "see if" / "this person's available".
 */
export function screenerAskedRecently(lines: readonly { role: string; text: string; at: number }[], now: number): boolean {
  const heard = lines.filter((line) => line.role === 'them' && line.at >= now - SCREENER_ASK_WINDOW_MS).map((line) => line.text).join(' ');
  return screenerAsked(heard.slice(-400));
}

/**
 * A voicemail greeting, not a screener asking for an introduction: Telnyx's screening detection
 * also fires on a voicemail's beep. RankSurge's call to a carrier voicemail ("...is not
 * available", then the beep) got screening_prompt_ended at the beep; the caller waited 4.6s more
 * for a screener's question, introduced itself in one sentence, and the voicemail had already
 * given up on the silence ("we didn't get your message").
 */
export function voicemailGreeting(lines: readonly { role: string; text: string }[]): boolean {
  const heard = lines.filter((line) => line.role === 'them').map((line) => line.text).join(' ').slice(-600);
  return !screenerAsked(heard) && (UNAVAILABLE.test(heard) || asksForMessage(heard));
}
const UNAVAILABLE = /\b(?:is (?:not |un)available|isn't available|not available (?:right now|at the moment|to take)|can(?:'t| ?not) (?:take|answer|come to) (?:your|the) (?:call|phone)|unable to (?:take|answer|come to) (?:your|the) (?:call|phone)|away from (?:the|my|his|her) (?:phone|desk)|forwarded to (?:an automated |a )?voice ?mail|voice ?mail ?box)\b/i;

/** The transcript note marking a call screener's prompt. */
export const SCREENING_NOTE = 'carrier detected a call screening prompt';

/**
 * Whether someone answered in person after the screener: since its note they spoke and the caller
 * answered them. The introduction it waited for is moot then, and sending it mid-conversation
 * makes the caller introduce itself again with a made-up name and task (Raghav's call to GEIM:
 * "this is Avery calling for Noel Hanna about a job application").
 */
export function answeredAfterScreener(lines: readonly { role: string; text: string }[]): boolean {
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].role === 'note' && lines[i].text === SCREENING_NOTE) {
      at = i;
      break;
    }
  }
  if (at < 0) return false;
  const theirs = lines.findIndex((line, i) => i > at && line.role === 'them');
  return theirs >= 0 && lines.some((line, i) => i > theirs && line.role === 'caller');
}

export const MACHINE_GUIDANCE: Record<MachineGuidance, string> = {
  machine:
    'The carrier detected an automated greeting, which may be voicemail or a call screener. Stay silent while the greeting plays. If a live person speaks to you, respond normally. Do not leave a message or hang up unless the audio confirms voicemail is recording.',
  greeting_ended:
    'The carrier detected a beep. If the audio confirms a voicemail greeting has finished and is recording, leave one or two sentences saying who you are, what it is about, and the callback number. Then hand off to hang up (end_call). If a live person is speaking, continue the conversation instead; a detector signal alone is not a reason to leave a message or hang up.',
  greeting_timeout:
    'The carrier timed out without detecting a voicemail beep. Follow the actual audio: respond normally to a live person, or wait quietly if a recorded greeting is still playing. This timeout does not mean voicemail is recording and is not a reason to leave a message or hang up.',
  screening:
    "An automatic call screener is ready for your introduction. If it asked who's calling, say who you are and why you're calling in one short sentence, then stay quiet and wait for the person to pick up. Do not leave a voicemail or hang up. If a live person is already speaking, continue the conversation normally.",
  human:
    'The carrier detected a live person. Continue the conversation normally. Disregard earlier automated greeting or voicemail instructions; do not leave a message or hang up based on those earlier detector signals.',
};
