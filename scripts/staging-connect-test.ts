/**
 * End-to-end test of joining a live call (call4me_connect_me), on staging, with nobody's phone.
 *
 *   npm run staging:connect-test [-- --listen] [--wait <seconds>] [--person <+phone>]
 *
 * The test places a call from staging's business account to its own number, waits for the two
 * assistants to talk, joins staging's person number the way call4me_connect_me does, then hangs up
 * and reads both assistants' transcripts: what each one heard is what came through the call. It
 * passes when the business heard what the person's assistant said, the person heard the business,
 * and our caller kept talking once they joined
 * (with --listen, when the person heard the business and the business did not hear them).
 *
 * --person joins a real phone instead of staging's person number, to check a customer's own line:
 * it rings from staging-test@call4.me's number, and the test passes when the business heard
 * anything from that phone after the join. Whether they heard the business, ask them.
 */
import { at, business, call, callsSinceStart, lines, numberOf, PERSON, printSides, sleep, untilAnswered, untilTalking, verdict, type Row } from './staging-api';

const args = process.argv.slice(2);
const listen = args.includes('--listen');
const waitIndex = args.indexOf('--wait');
const joinedSeconds = waitIndex >= 0 ? Number(args[waitIndex + 1]) : 40;
const personIndex = args.indexOf('--person');
const realPhone = personIndex >= 0 ? args[personIndex + 1] : null;
if (realPhone !== null && !/^\+[1-9]\d{7,14}$/.test(realPhone)) throw new Error(`--person takes a phone number like +14155550123, not ${realPhone}`);

const person = realPhone ? null : await numberOf(PERSON);
const personPhone = realPhone ?? person!.phone_number;

const placed = await call('POST', '/calls', {
  to: business.phone_number,
  business: 'Staging Connect Test',
  goal: 'Ask what they can help with, then ask about their hours and keep the conversation going with short follow-up questions. Do not hang up on your own.',
  category: 'general',
  details: { questions: 'What are your hours, and what can you help with?' },
  timezone: 'America/Los_Angeles',
  max_minutes: 4,
});
const callId: string = placed.id;
console.log(`placed ${callId}: ${business.phone_number} (business) calling itself`);
await untilAnswered(callId, placed.status);
console.log(`answered at ${at(Date.now())}; letting the two assistants talk`);
if (!(await untilTalking(callId))) {
  await call('POST', `/calls/${callId}/hang-up`).catch(() => {});
  console.log('INCONCLUSIVE  the two assistants never got talking, so nothing was joined: run it again');
  process.exit(2);
}

const joinAt = Date.now();
const connected = await call('POST', `/calls/${callId}/connect`, { phone: personPhone, mode: listen ? 'listen' : 'join' });
console.log(`${listen ? 'listening' : 'joining'} ${personPhone} (person) at ${at(joinAt)}: ${connected.message}`);
await sleep(joinedSeconds * 1000);
await call('POST', `/calls/${callId}/hang-up`).catch((err) => console.log(`hang up: ${err.message}`));
console.log(`hung up at ${at(Date.now())}; reading transcripts`);
await sleep(8_000);

const rows = await callsSinceStart([business.id, person?.id ?? business.id]);
const outbound = rows.find((r) => r.id === callId);
const businessSide = rows.find((r) => r.direction === 'inbound' && r.account_id === business.id);
const personSide = person ? rows.find((r) => r.direction === 'inbound' && r.account_id === person.id) : undefined;

const sides: [string, Row | undefined][] = [['our caller', outbound], ['business (answering assistant)', businessSide]];
if (person) sides.push(['person (answering assistant)', personSide]);
printSides(sides);

// What each assistant heard after the join is its "them" lines from then on. Our caller keeps
// talking once the person joins, so the business heard the person when something the person's
// assistant said shows up in what the business heard. A real phone has no assistant to compare
// with, so any speech after the join counts.
const heardAfterJoin = (r?: Row) => lines(r).filter((l) => l.role === 'them' && l.at >= joinAt).map((l) => l.text);
// Four words in a row in both: their speech overlaps on the line, so neither side hears the
// other's sentences whole, and "one two three" comes back as "1 2 3".
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const words = (t: string) => (t.toLowerCase().match(/[a-z']+|\d/g) ?? []).map((w) => (/\d/.test(w) ? DIGITS[Number(w)] : w));
const runs = (w: string[]) => w.slice(3).map((_, i) => w.slice(i, i + 4).join(' '));
const businessHeard = new Set(heardAfterJoin(businessSide).flatMap((t) => runs(words(t))));
const businessHeardPerson = realPhone
  ? heardAfterJoin(businessSide).length > 0
  : lines(personSide).some((l) => l.role === 'caller' && runs(words(l.text)).some((r) => businessHeard.has(r)));
const personHeard = heardAfterJoin(personSide).length > 0;
const joined = lines(outbound).some((l) => l.role === 'note' && /joined the call|is listening in/.test(l.text));
const joinedAt = lines(outbound).find((l) => l.role === 'note' && /joined the call|is listening in/.test(l.text))?.at ?? Infinity;
const callerKeptTalking = lines(outbound).some((l) => l.role === 'caller' && l.at > joinedAt);
const passed = verdict([
  [`the person's phone ${listen ? 'started listening' : 'joined'}`, joined],
  ...(realPhone ? [] : [['the person heard the business', personHeard] as const]),
  [listen ? 'the business did not hear the person' : 'the business heard the person', listen ? !businessHeardPerson : businessHeardPerson],
  ['our caller kept talking after they came on', callerKeptTalking],
]);
if (realPhone) console.log('ASK   whether they heard the business (staging\'s assistant) after picking up');
process.exit(passed ? 0 : 1);
