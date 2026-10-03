/**
 * Keypad tones played into the call's own audio (in-band DTMF). Telnyx's send_dtmf sends
 * RFC 2833 events, which reach US phone menus but are stripped on some international routes
 * (UAE menus never heard them). A tone in the audio survives any route that carries the voice.
 */

const SAMPLE_RATE = 8000;
/** Telnyx media frames: 20 ms of 8 kHz G.711 μ-law. */
export const FRAME_SAMPLES = 160;
export const FRAME_MS = 20;
export const TONE_MS = 120;
export const GAP_MS = 80;
/** What a "w" in the digits waits for, as with send_dtmf. */
export const WAIT_MS = 500;

/** How long a base64 chunk of 8 kHz μ-law audio plays: one byte per sample. */
export function pcmuMs(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return ((base64.length * 3) / 4 - padding) / (SAMPLE_RATE / 1000);
}

/** Loudest sample in silence GPT-Live streams between turns stays far below this. */
const SPEECH_LEVEL = 1000;

/** Whether a base64 chunk of μ-law audio carries speech, not the silence GPT-Live streams nonstop between turns. */
export function pcmuAudible(base64: string): boolean {
  const bytes = atob(base64);
  for (let i = 0; i < bytes.length; i++) if (Math.abs(mulawToLinear(bytes.charCodeAt(i))) > SPEECH_LEVEL) return true;
  return false;
}

const ROWS = [697, 770, 852, 941];
const COLS = [1209, 1336, 1477, 1633];
const KEYS = ['123A', '456B', '789C', '*0#D'];

/** The row and column frequencies of a keypad key, or null for anything else. */
export function dtmfFrequencies(key: string): [number, number] | null {
  for (let r = 0; r < KEYS.length; r++) {
    const c = KEYS[r].indexOf(key.toUpperCase());
    if (c >= 0) return [ROWS[r], COLS[c]];
  }
  return null;
}

/** G.711 μ-law encoding of one 16-bit linear sample. */
export function linearToMulaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  const s = Math.min(Math.abs(sample), CLIP) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** G.711 μ-law decoding, back to a 16-bit linear sample. */
export function mulawToLinear(byte: number): number {
  const u = ~byte & 0xff;
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
  return u & 0x80 ? 0x84 - t : t - 0x84;
}

/**
 * μ-law samples for `digits`: each key a 120 ms dual tone then an 80 ms gap, "w" half a second
 * of silence. Each tone sits around -9 dBm0 (two components at a quarter of full scale), well
 * inside what phone menus detect.
 */
export function dtmfSamples(digits: string): Uint8Array {
  const out: number[] = [];
  const silence = (ms: number) => {
    for (let i = 0; i < (SAMPLE_RATE * ms) / 1000; i++) out.push(linearToMulaw(0));
  };
  for (const key of digits) {
    if (key === 'w' || key === 'W') {
      silence(key === 'W' ? WAIT_MS * 2 : WAIT_MS);
      continue;
    }
    const f = dtmfFrequencies(key);
    if (!f) continue;
    const n = (SAMPLE_RATE * TONE_MS) / 1000;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      out.push(linearToMulaw(Math.round(8000 * (Math.sin(2 * Math.PI * f[0] * t) + Math.sin(2 * Math.PI * f[1] * t)))));
    }
    silence(GAP_MS);
  }
  return Uint8Array.from(out);
}

/** The samples cut into base64 media frames of FRAME_SAMPLES, the last one padded with silence. */
export function dtmfFrames(digits: string): string[] {
  const samples = dtmfSamples(digits);
  const frames: string[] = [];
  for (let i = 0; i < samples.length; i += FRAME_SAMPLES) {
    const frame = new Uint8Array(FRAME_SAMPLES).fill(linearToMulaw(0));
    frame.set(samples.subarray(i, i + FRAME_SAMPLES));
    frames.push(btoa(String.fromCharCode(...frame)));
  }
  return frames;
}
