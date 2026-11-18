/**
 * GPT-Live drops input audio sent faster than 1.2x real time beyond a 5 second burst
 * (input_audio_rate_limit_exceeded: "This append was dropped, and further excess audio will be
 * dropped"), and what it drops is the newest audio: what the business just said. Phone frames go
 * to the voice model as they arrive, so running past that pace means the phone's frames reached
 * this session bunched up. It happened 9 times over Nov 16 to 18 without saying on which calls.
 *
 * This keeps the same allowance per voice session, so the call log shows when the phone's audio
 * runs past it and how: how much audio arrived in how long, after what pause between frames.
 */
export const INPUT_RATE = 1.2;
export const INPUT_BURST_MS = 5_000;

export interface InputBurst {
  /** Audio sent past the allowance. */
  overMs: number;
  /** Audio sent, and the wall time it took, since the allowance was last full. */
  sentMs: number;
  wallMs: number;
  /** The longest wait between sends over that stretch. */
  longestPauseMs: number;
}

export class InputPace {
  /** Audio that can be sent right now without going past GPT-Live's pace. */
  private allowance = INPUT_BURST_MS;
  private lastAt: number | null = null;
  /** The stretch since the allowance was last full: null while it is. */
  private stretch: { since: number; sentMs: number; longestPauseMs: number } | null = null;
  /** Whether this stretch has been reported: one report per stretch past the allowance. */
  private reported = false;

  /** `ms` of input audio goes to the voice model at `now`. Returns a report the first time a stretch runs past the allowance. */
  sent(now: number, ms: number): InputBurst | null {
    const pause = this.lastAt === null ? 0 : Math.max(0, now - this.lastAt);
    this.allowance = Math.min(INPUT_BURST_MS, this.allowance + pause * INPUT_RATE);
    this.lastAt = now;
    if (this.allowance >= INPUT_BURST_MS) {
      this.stretch = null;
      this.reported = false;
    }
    this.stretch ??= { since: now, sentMs: 0, longestPauseMs: 0 };
    this.stretch.sentMs += ms;
    this.stretch.longestPauseMs = Math.max(this.stretch.longestPauseMs, pause);
    this.allowance -= ms;
    if (this.allowance >= 0 || this.reported) return null;
    this.reported = true;
    return { overMs: Math.round(-this.allowance), sentMs: Math.round(this.stretch.sentMs), wallMs: now - this.stretch.since, longestPauseMs: this.stretch.longestPauseMs };
  }
}
