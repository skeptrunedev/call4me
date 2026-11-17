/**
 * How well the caller's audio kept ahead of the phone. GPT-Live streams audio nonstop, silence
 * between turns included, at about the pace it plays, in chunks (200 ms ones on
 * call_8hrqttc22nigzvc4). So the phone has almost nothing queued, and a chunk that lands after
 * the one before it finished playing leaves the line silent until it arrives. On that call's
 * voicemail they came every 240 to 360 ms, and the message dropped out four times a second.
 *
 * This counts those gaps over continuous stretches of streaming, with how much audio arrived in
 * how long, and the longest wait between the phone's own frames over the same stretch. Phone
 * frames arriving on time while the caller's audio arrives late puts the delay upstream of us
 * (in the voice model, or on the way from it), not in this object falling behind.
 */
export const PLAYOUT_WINDOW_MS = 10_000;
/** A gap of one 20 ms frame or less, the size Telnyx plays out, isn't heard. */
const HEARD_GAP_MS = 20;
/** What speech has to lose to gaps in a window before the window is reported. */
const REPORT_GAP_MS = 300;
/** A chunk this long after the last one sent starts a new stretch: the caller was held off the line, or its session was replaced. */
const CONTINUOUS_MS = 1_000;

export interface PlayoutReport {
  /** Gaps heard in speech. */
  gaps: number;
  gapMs: number;
  /** Caller audio sent to the phone over the window, and the window's length. */
  receivedMs: number;
  wallMs: number;
  /** The longest wait between frames from the phone over the window. */
  longestPhoneGapMs: number;
}

export class Playout {
  /** When the open window's first and latest chunks went to the phone: null before the first. */
  private startedAt: number | null = null;
  private lastSentAt: number | null = null;
  private gaps = 0;
  private gapMs = 0;
  private receivedMs = 0;
  private lastPhoneAt: number | null = null;
  private longestPhoneGapMs = 0;
  /** Gaps heard over the whole call. */
  readonly total = { gaps: 0, gapMs: 0 };

  /** A frame from the phone arrived at `now`. */
  phoneFrame(now: number): void {
    if (this.lastPhoneAt !== null) this.longestPhoneGapMs = Math.max(this.longestPhoneGapMs, now - this.lastPhoneAt);
    this.lastPhoneAt = now;
  }

  /**
   * A chunk of `ms` of caller audio goes to the phone at `now`, and what was sent before it plays
   * until `playsUntil`. Returns a window's report when it closes having lost enough of its speech.
   */
  sent(now: number, ms: number, audible: boolean, playsUntil: number): PlayoutReport | null {
    const continuous = this.lastSentAt !== null && now - this.lastSentAt < CONTINUOUS_MS;
    let report: PlayoutReport | null = null;
    if (!continuous || this.startedAt === null || now - this.startedAt >= PLAYOUT_WINDOW_MS) {
      // A break in the stream ends the window at its last chunk; a full window ends at this one.
      report = this.close(continuous ? now : (this.lastSentAt ?? now));
      this.startedAt = now;
    }
    this.lastSentAt = now;
    const gap = continuous ? now - playsUntil : 0;
    if (audible && gap > HEARD_GAP_MS) {
      this.gaps++;
      this.gapMs += gap;
      this.total.gaps++;
      this.total.gapMs += gap;
    }
    this.receivedMs += ms;
    return report;
  }

  private close(endedAt: number): PlayoutReport | null {
    const report: PlayoutReport | null =
      this.startedAt !== null && this.gapMs >= REPORT_GAP_MS
        ? { gaps: this.gaps, gapMs: Math.round(this.gapMs), receivedMs: Math.round(this.receivedMs), wallMs: endedAt - this.startedAt, longestPhoneGapMs: this.longestPhoneGapMs }
        : null;
    this.gaps = 0;
    this.gapMs = 0;
    this.receivedMs = 0;
    this.longestPhoneGapMs = 0;
    return report;
  }
}
