import { VOICES, type Voice } from '../server/services/dialer';

/** The line every sample says, so the voices are compared on the same words. */
export const SAMPLE_LINE = "Hi! This is Alex's assistant. I was hoping to get a table for four tonight, around seven. Do you have anything open?";

/**
 * One sample per caller voice, recorded by scripts/record-voice-samples.mjs straight from
 * GPT-Live at the phone format real calls use (8 kHz μ-law), so each sounds the way the
 * business hears it.
 */
export const VOICE_SAMPLES: { voice: Voice; audio: string; isDefault: boolean }[] = VOICES.map((voice) => ({
  voice,
  audio: `/static/voices/${voice}.mp3`,
  isDefault: voice === 'marin',
}));
