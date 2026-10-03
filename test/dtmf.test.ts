import assert from 'node:assert/strict';
import test from 'node:test';
import { inbandKeysFor } from '../src/server/services/dialer';
import { dtmfFrames, dtmfFrequencies, dtmfSamples, FRAME_SAMPLES, GAP_MS, linearToMulaw, mulawToLinear, pcmuMs, TONE_MS, WAIT_MS } from '../src/server/voice/dtmf';

const RATE = 8000;
const ALL = [697, 770, 852, 941, 1209, 1336, 1477, 1633];

/** Signal power at `freq` (Goertzel). */
function power(x: number[], freq: number): number {
  const k = (2 * Math.cos((2 * Math.PI * freq) / RATE));
  let s1 = 0;
  let s2 = 0;
  for (const v of x) {
    const s0 = v + k * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - k * s1 * s2;
}

/** The two strongest DTMF frequencies in a stretch of decoded samples. */
function strongest(x: number[]): number[] {
  return [...ALL].sort((a, b) => power(x, b) - power(x, a)).slice(0, 2).sort((a, b) => a - b);
}

const decode = (u: Uint8Array) => Array.from(u, mulawToLinear);

test('μ-law encodes and decodes within its quantization step', () => {
  for (const v of [0, 100, -100, 1000, -1000, 8000, -8000, 16000, 30000, -30000]) {
    const back = mulawToLinear(linearToMulaw(v));
    assert.ok(Math.abs(back - v) <= Math.max(16, Math.abs(v) * 0.07), `${v} -> ${back}`);
  }
});

test('every key decodes back to its own row and column frequency', () => {
  for (const key of '0123456789*#') {
    const samples = decode(dtmfSamples(key));
    const tone = samples.slice(0, (RATE * TONE_MS) / 1000);
    assert.deepEqual(strongest(tone), dtmfFrequencies(key)!.slice().sort((a, b) => a - b), `key ${key}`);
  }
});

test('each key is a 120 ms tone then an 80 ms gap; w waits half a second', () => {
  const tone = (RATE * TONE_MS) / 1000;
  const gap = (RATE * GAP_MS) / 1000;
  const samples = decode(dtmfSamples('15'));
  assert.equal(samples.length, 2 * (tone + gap));
  const quiet = (x: number[]) => x.every((v) => Math.abs(v) < 8);
  assert.ok(quiet(samples.slice(tone, tone + gap)), 'gap after the first key is silent');
  assert.deepEqual(strongest(samples.slice(tone + gap, 2 * tone + gap)), [770, 1336]);
  assert.equal(dtmfSamples('1w2').length, 2 * (tone + gap) + (RATE * WAIT_MS) / 1000);
  assert.equal(dtmfSamples('x').length, 0, 'anything that is not a key is skipped');
});

test('frames are 20 ms of μ-law, the last one padded with silence', () => {
  const frames = dtmfFrames('1');
  assert.equal(frames.length, Math.ceil(((RATE * (TONE_MS + GAP_MS)) / 1000) / FRAME_SAMPLES));
  for (const f of frames) assert.equal(atob(f).length, FRAME_SAMPLES);
});

test('only calls with a non +1 number press keys as tones; +1 calls keep send_dtmf', () => {
  assert.equal(inbandKeysFor('+97144408888'), true);
  assert.equal(inbandKeysFor('+442071234567'), true);
  assert.equal(inbandKeysFor('+14155550123'), false);
  assert.equal(inbandKeysFor('(415) 555-0123'), false);
  assert.equal(inbandKeysFor('+16135550123'), false, 'Canada is a +1 home number');
  assert.equal(inbandKeysFor('not a number'), false);
});

test('pcmuMs times a GPT-Live audio delta from its bytes', () => {
  // GPT-Live sends 100 ms deltas (800 bytes) with no start/end timing on them.
  assert.equal(pcmuMs(Buffer.alloc(800, 0xff).toString('base64')), 100);
  assert.equal(pcmuMs(Buffer.alloc(161, 0xff).toString('base64')), 20.125);
  assert.equal(pcmuMs(Buffer.alloc(162, 0xff).toString('base64')), 20.25);
  assert.equal(pcmuMs(''), 0);
  for (const frame of dtmfFrames('1')) assert.equal(pcmuMs(frame), FRAME_SAMPLES / 8);
});
