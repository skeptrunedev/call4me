import { z } from 'zod';

export const recordingInput = z.object({ call_id: z.string().min(1).max(40).describe('The call id returned when placing or listing calls.') });
// Loose, like the number outputs (lib/number-schema.ts): a cached outputSchema must accept fields added later.
export const recordingOutput = z.looseObject({
  call_id: z.string(),
  recordings: z.array(z.looseObject({
    id: z.string(),
    download_urls: z.looseObject({ mp3: z.url().optional(), wav: z.url().optional() }),
    duration_millis: z.number().nonnegative().nullable(),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
  })),
  message: z.string(),
});

export const recordingDescription = 'Get existing recordings of a finished call owned by the signed in account. Returns fresh download links when available. An empty list means no recording is available yet. Links may expire; request this again for fresh links. Only share the links with the user.';
export const recordingPath = '/api/calls/{call_id}/recordings';
