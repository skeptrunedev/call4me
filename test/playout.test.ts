import assert from 'node:assert/strict';
import test from 'node:test';
import { Playout, PLAYOUT_WINDOW_MS, type PlayoutReport } from '../src/server/voice/playout';

/** Chunks of `ms` sent every `every` ms from `from`, tracked the way session.ts tracks playback; the reports that came out. */
function stream(p: Playout, opts: { from: number; count: number; every: number; ms?: number; audible?: boolean; playsUntil?: { at: number }; phoneEvery?: number }): PlayoutReport[] {
  const ms = opts.ms ?? 200;
  const clock = opts.playsUntil ?? { at: 0 };
  const reports: PlayoutReport[] = [];
  let phoneAt = opts.from;
  for (let i = 0; i < opts.count; i++) {
    const now = opts.from + i * opts.every;
    // The phone's own frames, arriving in between.
    for (; opts.phoneEvery && phoneAt <= now; phoneAt += opts.phoneEvery) p.phoneFrame(phoneAt);
    const r = p.sent(now, ms, opts.audible ?? true, clock.at);
    if (r) reports.push(r);
    clock.at = Math.max(clock.at, now) + ms;
  }
  return reports;
}

test("speech arriving slower than it plays is reported: call_8hrqttc22nigzvc4's voicemail", () => {
  const p = new Playout();
  // 200 ms chunks every 260 ms, as on that voicemail, with the phone's frames on time.
  const reports = stream(p, { from: 0, count: 50, every: 260, phoneEvery: 20 });
  assert.equal(reports.length, 1);
  const [r] = reports;
  assert.ok(r.gaps >= 35, `${r.gaps} gaps`);
  assert.equal(r.gapMs, r.gaps * 60);
  assert.ok(r.wallMs >= PLAYOUT_WINDOW_MS);
  assert.ok(r.receivedMs < r.wallMs, 'less audio arrived than the time it took');
  assert.equal(r.longestPhoneGapMs, 20);
  assert.equal(p.total.gaps, 49);
});

test('a stream that keeps pace, or runs ahead, loses nothing', () => {
  const p = new Playout();
  assert.deepEqual(stream(p, { from: 0, count: 80, every: 200 }), []);
  assert.deepEqual(stream(p, { from: 20_000, count: 80, every: 120 }), []);
  assert.equal(p.total.gaps, 0);
});

test('late silence, and a break in the stream, are not gaps in speech', () => {
  const p = new Playout();
  // Silence between turns arriving late is never heard.
  assert.deepEqual(stream(p, { from: 0, count: 60, every: 260, audible: false }), []);
  // The caller held off the line for 3 s (a menu, keypad tones): its next chunk starts a new stretch.
  const clock = { at: 0 };
  stream(p, { from: 30_000, count: 5, every: 200, playsUntil: clock });
  stream(p, { from: 34_000, count: 5, every: 200, playsUntil: clock });
  assert.equal(p.total.gaps, 0);
});

test('a window that loses only a little is not reported, but counts toward the call', () => {
  const p = new Playout();
  // 200 ms chunks every 220 ms: 20 ms short each time, one frame, not heard.
  assert.deepEqual(stream(p, { from: 0, count: 60, every: 220 }), []);
  assert.equal(p.total.gaps, 0);
  // 240 ms apart: 40 ms gaps, heard, but a window needs 300 ms of them to be reported.
  const reports = stream(p, { from: 20_000, count: 8, every: 240 });
  assert.deepEqual(reports, []);
  assert.equal(p.total.gaps, 7);
});
