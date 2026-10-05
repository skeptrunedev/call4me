/**
 * Telnyx's answering machine detection (premium, with Apple call screening) on calls we place.
 * Its webhooks tell the live call what picked up and when a voicemail greeting is over, so the
 * caller neither talks over a greeting ("Hey, hello" sounds like a person) nor waits through the
 * beep without leaving a message.
 */

/** What the carrier reported: a machine answered, its greeting ended, or a call screener answered. */
export type MachineEvent = 'machine' | 'greeting_ended' | 'screening';

/** A Telnyx webhook's event type and result, as one of ours; null for everything else (a person answering, not_sure). */
export function machineEventOf(type: string | undefined, result: string | undefined): MachineEvent | null {
  switch (type) {
    case 'call.machine.premium.detection.ended':
      return result === 'machine' ? 'machine' : null;
    case 'call.machine.premium.greeting.ended':
      return result === 'beep_detected' || result === 'no_beep_detected' || result === 'prompt_ended' ? 'greeting_ended' : null;
    case 'call.machine.premium.call_screening.detected':
      return 'screening';
    default:
      return null;
  }
}

/** What the caller is told when each happens. */
export const MACHINE_GUIDANCE: Record<MachineEvent, string> = {
  machine:
    "A voicemail greeting answered, not a person. Don't say anything to it, not even hello: stay completely silent until you're told the greeting is over.",
  greeting_ended:
    'The voicemail greeting is over and it is recording now. Leave your message: one or two sentences saying who you are, what it is about, and the callback number. Then hand off to hang up (end_call).',
  screening:
    "An automatic call screener answered and is asking who's calling. In one short sentence, say who you are and why you're calling, then stay quiet and wait for the person to pick up.",
};
