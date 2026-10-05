import assert from 'node:assert/strict';

/** Preserve carrier timestamps, including missing packets, rather than
 * concatenating arriving packets and silently compressing the conversation.
 * Overlapping contradictory audio makes the recording unusable.
 */
export function assembleReceivedAudio(frames, maxSeconds = 120) {
  const sorted = [...frames].sort((a, b) => a.timestamp - b.timestamp || a.chunk - b.chunk);
  let end = 0;
  for (const f of sorted) {
    assert.ok(Number.isInteger(f.timestamp) && f.timestamp >= 0, 'invalid packet timestamp');
    assert.ok(Buffer.isBuffer(f.audio) && f.audio.length > 0, 'invalid packet audio');
    // This PCMU stream's timestamps advance by 160 for each 160 sample,
    // 20 ms packet. They are the 8 kHz sample clock, not milliseconds.
    end = Math.max(end, f.timestamp + f.audio.length);
    assert.ok(end <= maxSeconds * 8000, 'recording exceeds duration budget');
  }
  const audio = Buffer.alloc(end, 255);
  const present = new Uint8Array(end);
  let duplicateBytes = 0;
  for (const f of sorted) {
    const at = f.timestamp;
    for (let i = 0; i < f.audio.length; i++) {
      if (present[at + i]) {
        assert.equal(audio[at + i], f.audio[i], 'conflicting overlapping packets');
        duplicateBytes++;
      }
      audio[at + i] = f.audio[i];
      present[at + i] = 1;
    }
  }
  const firstSample = sorted[0]?.timestamp ?? 0;
  const missingBytes = present.subarray(firstSample).reduce((n, x) => n + (x ? 0 : 1), 0);
  return { audio, leadingMillis: firstSample / 8, missingMillis: missingBytes / 8, duplicateBytes };
}

/** G.711 mu law RMS gate, used only to wait for the caller to stop speaking. */
export function hasSpeech(bytes, threshold = 500) {
  if (!bytes.length) return false;
  let energy = 0;
  for (const b of bytes) {
    const u = (~b) & 255;
    const magnitude = (((u & 15) << 3) + 132) << ((u >> 4) & 7);
    const sample = magnitude - 132;
    energy += sample * sample;
  }
  return Math.sqrt(energy / bytes.length) > threshold;
}
