import assert from 'node:assert/strict';
import test from 'node:test';
import { INPUT_BURST_MS, InputPace } from '../src/server/voice/input-pace';

const FRAME = 20;

test('phone frames arriving in real time never run past the voice model pace', () => {
  const pace = new InputPace();
  for (let now = 0; now < 120_000; now += FRAME) assert.equal(pace.sent(now, FRAME), null);
});

test('a flush of up to five buffered seconds fits the burst, and real time after it still does', () => {
  const pace = new InputPace();
  for (let i = 0; i < INPUT_BURST_MS / FRAME; i++) assert.equal(pace.sent(0, FRAME), null);
  for (let now = FRAME; now < 60_000; now += FRAME) assert.equal(pace.sent(now, FRAME), null);
});

test('frames held up past the burst and then delivered at once are reported once, with the pause before them', () => {
  const pace = new InputPace();
  let now = 0;
  for (; now < 2_000; now += FRAME) pace.sent(now, FRAME);
  // Nothing for 7 seconds, then those 7 seconds of audio arrive together.
  now += 7_000;
  const reports = [];
  for (let i = 0; i < 7_000 / FRAME; i++) {
    const r = pace.sent(now, FRAME);
    if (r) reports.push(r);
  }
  assert.equal(reports.length, 1);
  assert.equal(reports[0]!.wallMs, 0);
  assert.ok(reports[0]!.sentMs > INPUT_BURST_MS);
  assert.equal(reports[0]!.overMs, FRAME);
  assert.equal(reports[0]!.longestPauseMs, 7_020);
  // Back in real time, the allowance refills and a later burst is reported again.
  for (let i = 0; i < 1_000; i++) assert.equal(pace.sent((now += FRAME), FRAME), null);
  now += 9_000;
  let again = 0;
  for (let i = 0; i < 9_000 / FRAME; i++) if (pace.sent(now, FRAME)) again++;
  assert.equal(again, 1);
});

test('audio arriving steadily faster than 1.2x real time runs past the pace once the burst is spent', () => {
  const pace = new InputPace();
  let first: number | null = null;
  // Frames 10 ms apart: twice real time.
  for (let now = 0; now < 20_000 && first === null; now += 10) if (pace.sent(now, FRAME)) first = now;
  assert.ok(first !== null && first > 6_000 && first < 7_000, `ran past at ${first}ms`);
});
