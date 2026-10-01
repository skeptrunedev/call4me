import { hmacHex, safeEqual } from '../lib/keys';
import { sessionFor } from './stub';

export { VoiceSession } from './session';
export { RecapLog } from './recap-log';

/**
 * The voice Worker (wrangler.voice.jsonc): the VoiceSession durable objects and Telnyx's media
 * stream, on their own host. Deploying a Worker resets the durable objects it defines, which
 * drops every live call, so they live apart from the site and only redeploy when the voice
 * bundle itself changes, and then only once no call is up (scripts/deploy-voice.sh).
 */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // The bundle hash this version was deployed from; deploy-voice.sh skips unchanged bundles.
    if (url.pathname === '/build') return new Response(env.VOICE_BUILD);
    // The session interface this version serves; the site deploys ahead of it only when they match.
    if (url.pathname === '/contract') return new Response(env.VOICE_CONTRACT);
    // Telnyx's media stream for a call. The path carries an HMAC of the call id, so only the
    // URL we handed Telnyx when dialing can attach audio to a call.
    // Cloudflare can still reset a session mid-call ("This script has been upgraded"); Telnyx then
    // reconnects the stream once, and a reconnect that lands on the instance being reset is retried
    // on a fresh stub, which resumes the call (VoiceSession.acceptStream).
    const m = url.pathname.match(/^\/voice\/stream\/([^/]+)\/([^/]+)$/);
    if (!m || req.method !== 'GET') return new Response('not found', { status: 404 });
    const [, callId, sig] = m;
    if (!safeEqual(sig, await hmacHex(env.STREAM_SECRET, callId))) return new Response('forbidden', { status: 403 });
    for (let attempt = 1; ; attempt++) {
      try {
        return await sessionFor(env, callId).fetch(new Request('https://session/stream', req));
      } catch (err) {
        if (!(err as { retryable?: boolean }).retryable || attempt >= 3) throw err;
        console.warn('stream attach retry', callId, attempt, String(err));
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  },
} satisfies ExportedHandler<Env>;
