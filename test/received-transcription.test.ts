import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreReceivedReadback } from '../scripts/received-transcription.mjs';

test('punctuation changes do not turn correct facts into transcription errors', () => {
  assert.deepEqual(scoreReceivedReadback('October 22nd, 2026, at 645 p.m. Pacific Time. Reference code, B-7-Q-2-9.', 'corrected'),
    { date: true, time: true, zone: true, code: true });
});

test('old dates, missing PM, incomplete codes and Q digit substitutions fail', () => {
  assert.deepEqual(scoreReceivedReadback('October 12, 2026, at 6:45. Pacific. Reference code is B7229.', 'corrected'),
    { date: false, time: false, zone: true, code: false });
  assert.equal(scoreReceivedReadback('Reference code is B-7.', 'initial').code, false);
  assert.equal(scoreReceivedReadback('October 12, 2025.', 'initial').date, false);
});

test('a contradictory second date is not rescued by one correct mention', () => {
  assert.equal(scoreReceivedReadback('October 22, 2026. October 12, 2026.', 'corrected').date, false);
});

test('PT recovers the requested named zone without asserting a UTC offset', () => {
  assert.equal(scoreReceivedReadback('7:15 PM PT.', 'initial').zone, true);
  assert.equal(scoreReceivedReadback('7:15 PM PST.', 'initial').zone, false);
});
