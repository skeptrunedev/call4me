import type { VoiceSession } from './session';

/**
 * The durable object for a call id; placed near Telnyx's and OpenAI's US regions. Apart from
 * session.ts so the site Worker reaches a call without bundling the session and its SDKs.
 */
export function sessionFor(env: Env, callId: string): DurableObjectStub<VoiceSession> {
  return env.VOICE_SESSION.get(env.VOICE_SESSION.idFromName(callId), { locationHint: 'enam' });
}

/** The Cloudflare colo Telnyx's media stream came in through, passed on to the session for its logs. */
export const EDGE_COLO_HEADER = 'x-edge-colo';
