import { recordingOutput } from '../lib/recording-schema';
import { telnyx } from '../lib/telnyx';
import { ACTIVE, CallError, calls } from './calls';

/** User access only. Nothing here talks to a live session or changes call state. */
export async function getCallRecordings(env: Env, accountId: string, callId: string) {
  const row = await calls(env.DB).forAccount(accountId, callId);
  if (ACTIVE.includes(row.status)) throw new CallError('the call must finish before recordings can be retrieved', 409);
  const provider = telnyx(env);
  const controlId = row.telnyx_call_control_id;
  let legId: string | null = null;
  if (controlId) {
    const saved = await env.DB.prepare('SELECT call_leg_id FROM call_provider_legs WHERE call_control_id = ?').bind(controlId).first<{ call_leg_id: string }>();
    legId = saved?.call_leg_id ?? await provider.callLeg(controlId);
    if (legId && !saved) await env.DB.prepare('INSERT OR IGNORE INTO call_provider_legs (call_control_id, call_leg_id) VALUES (?, ?)').bind(controlId, legId).run();
  }
  const records = controlId ? await provider.recordings(controlId, legId ?? undefined) : [];
  const recordings = records.filter((r) => r.status === 'completed' && (r.download_urls?.mp3 || r.download_urls?.wav)).map((r) => ({
    id: r.id,
    download_urls: {
      ...(r.download_urls?.mp3 ? { mp3: r.download_urls.mp3 } : {}),
      ...(r.download_urls?.wav ? { wav: r.download_urls.wav } : {}),
    },
    duration_millis: r.duration_millis ?? null,
    started_at: r.recording_started_at ?? null,
    ended_at: r.recording_ended_at ?? null,
  }));
  return recordingOutput.parse({
    call_id: row.id,
    recordings,
    message: recordings.length ? 'Download links may expire. Request recordings again for fresh links. Only share these links with the user.' : 'No recording is available for this call yet. It may still be processing, or no recording was saved.',
  });
}
