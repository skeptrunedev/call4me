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
