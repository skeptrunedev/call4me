/**
 * End-to-end test of a call's time limit, on staging: the wrap-up notice reaches our caller without
 * silencing it, and the caller finishes the call itself.
 *
 *   npm run staging:time-limit-test
 *
 * Places a one-minute call from staging's business account to its own number and lets the two
 * assistants talk. The wrap-up notice goes in 30s after pickup (session.ts: wrapAt is
 * max(30, max_minutes * 60 - 45)s), the hard stop 40s after that, with more time while the two are
 * still talking. Passes when our caller kept answering the business after the notice, never leaving
 * it waiting longer than QUIET_LIMIT_S, and ended the call with its own goodbye (end_call) rather
 * than being cut off. The notices themselves show in call4me-voice-staging's logs as "time note".
 */
import { at, business, call, callsSinceStart, lines, printSides, sleep, untilAnswered, untilTalking, verdict } from './staging-api';

const WRAP_AFTER_S = 30;
const QUIET_LIMIT_S = 8;
// Speech runs about 2.5 words a second; a line's time is when it started.
const spokenMs = (text: string) => (text.split(/\s+/).length / 2.5) * 1000;

const placed = await call('POST', '/calls', {
  to: business.phone_number,
  business: 'Staging Time Limit Test',
  goal: 'Ask what they can help with and about their hours, with short follow-up questions about each answer.',
  category: 'general',
  details: { questions: 'What are your hours, and what can you help with?' },
  timezone: 'America/Los_Angeles',
  max_minutes: 1,
});
const callId: string = placed.id;
console.log(`placed ${callId}: ${business.phone_number} (business) calling itself, one minute`);
await untilAnswered(callId, placed.status);
console.log(`answered at ${at(Date.now())}; letting the two assistants talk`);
if (!(await untilTalking(callId))) {
  await call('POST', `/calls/${callId}/hang-up`).catch(() => {});
  console.log('INCONCLUSIVE  the two assistants never got talking: run it again');
  process.exit(2);
}

let status = 'in_progress';
for (let i = 0; i < 120 && status === 'in_progress'; i++) {
  await sleep(2_000);
  status = (await call('GET', `/calls/${callId}`)).status;
}
if (status === 'in_progress') {
  await call('POST', `/calls/${callId}/hang-up`).catch(() => {});
  console.log('FAIL  the call was still going 4 minutes in; hung it up');
  process.exit(1);
}
console.log(`ended at ${at(Date.now())} (${status}); reading transcripts`);
await sleep(5_000);

const rows = await callsSinceStart([business.id]);
const outbound = rows.find((r) => r.id === callId);
printSides([['our caller', outbound], ['business (answering assistant)', rows.find((r) => r.direction === 'inbound')]]);

const wrapAt = (outbound?.answered_at ?? Infinity) + WRAP_AFTER_S * 1000;
const spoken = lines(outbound).filter((l) => l.role === 'them' || l.role === 'caller');
// The business finished a line after the notice: how long until our caller answered it.
const waits = spoken
  .map((l, i) => ({ l, next: spoken[i + 1] }))
  .filter(({ l }) => l.role === 'them' && l.at + spokenMs(l.text) >= wrapAt)
  .map(({ l, next }) => ((next?.role === 'caller' ? next.at : (outbound?.ended_at ?? Date.now())) - (l.at + spokenMs(l.text))) / 1000);
const longest = Math.max(0, ...waits);
const passed = verdict([
  ['our caller spoke after the wrap-up notice', spoken.some((l) => l.role === 'caller' && l.at > wrapAt)],
  [`our caller never left the business waiting more than ${QUIET_LIMIT_S}s after it (longest ${longest.toFixed(1)}s)`, longest <= QUIET_LIMIT_S],
  ['our caller ended the call with its goodbye, not the time limit', /end_call/.test(outbound?.end_reason ?? '')],
]);
process.exit(passed ? 0 : 1);
