import assert from 'node:assert/strict';
import test from 'node:test';
// Evaluation helpers do not create connections or make calls when imported.
import { assembleReceivedAudio, hasSpeech } from '../scripts/received-audio.mjs';

test('received audio reorders packets and preserves a lost packet as a timed gap', () => {
  const a = Buffer.alloc(160, 25);
  const b = Buffer.alloc(160, 30);
  const result = assembleReceivedAudio([
    { timestamp: 320, chunk: 3, audio: b },
    { timestamp: 0, chunk: 1, audio: a },
  ]);
  assert.equal(result.audio.length, 480);
  assert.deepEqual(result.audio.subarray(0, 160), a);
  assert.deepEqual(result.audio.subarray(160, 320), Buffer.alloc(160, 255));
  assert.deepEqual(result.audio.subarray(320), b);
  assert.equal(result.missingMillis, 20);
});

test('a duplicate packet does not add time, and conflicting overlaps fail', () => {
  const packet = { timestamp: 0, chunk: 1, audio: Buffer.alloc(160, 25) };
  const result = assembleReceivedAudio([packet, packet]);
  assert.equal(result.audio.length, 160);
  assert.equal(result.duplicateBytes, 160);
  assert.throws(() => assembleReceivedAudio([packet, { ...packet, audio: Buffer.alloc(160, 30) }]), /conflicting/);
});

test('the initial sample clock offset preserves duration without counting packet loss', () => {
  const result = assembleReceivedAudio([{ timestamp: 160, chunk: 1, audio: Buffer.alloc(160, 25) }]);
  assert.equal(result.audio.length / 8000, 0.04);
  assert.equal(result.leadingMillis, 20);
  assert.equal(result.missingMillis, 0);
});

test('malformed or unbounded carrier timestamps cannot fabricate a recording', () => {
  for (const timestamp of [NaN, -1, 0.5, 1_000_000]) {
    assert.throws(() => assembleReceivedAudio([{ timestamp, chunk: 1, audio: Buffer.alloc(160) }]));
  }
});

test('mu law positive and negative silence do not trigger the speech gate', () => {
  assert.equal(hasSpeech(Buffer.alloc(160, 255)), false);
  assert.equal(hasSpeech(Buffer.alloc(160, 127)), false);
  assert.equal(hasSpeech(Buffer.alloc(160, 0)), true);
  assert.equal(hasSpeech(Buffer.alloc(0)), false);
});
