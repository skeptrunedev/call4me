/** Supported GPT-Live caller voices. marin is the model default. */
export const VOICES = ['marin', 'cedar', 'gleam', 'meridian', 'vesper', 'willow'] as const;
export type Voice = (typeof VOICES)[number];

/**
 * The regional accent OpenAI documents for a voice (the "Regional influence" column at
 * https://developers.openai.com/api/docs/guides/live-conversations). Only the voices people pick
 * *for* their accent are listed: left to itself, the model speaks them in that accent most of the
 * time but drifts to General American in roughly a third of sessions (18 recorded sessions,
 * 2026-10-11), which is exactly the call where the choice was the point. The call prompt tells
 * the model to hold the accent; the voices page shows it.
 */
export const VOICE_ACCENTS: Partial<Record<Voice, string>> = { vesper: 'British', willow: 'Irish' };
