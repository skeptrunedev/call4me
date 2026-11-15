/**
 * End-to-end test of a call outliving its voice session, on staging: on hold, the call moves to a
 * new GPT-Live session, and when the business comes back the conversation carries on as if nothing
 * happened.
 *
 *   npm run staging:rollover-test
 *
 * GPT-Live ends every session two hours in; staging's voice Worker plans its rollovers around
 * VOICE_SESSION_SECONDS instead (wrangler.voice.staging.jsonc). A call that long is a hold, so this
 * one holds. Staging's business account calls its own number, and our caller leaves a long message
 * one item at a time: two assistants asked only questions ran out of them and said goodbye within a
 * minute. Partway through, the business puts it on hold the way a person does ("let me check with
 * them": a question out to its owner), and this test answers that question only once our caller's
 * session is past due. Two assistants talking leave no quiet moment for a rollover off hold: over
 * two minutes, their pauses never reached 2s. The business account's answering instructions carry
 * the hold for the test and are put back after it.
 *
 * Passes when our caller's session rolled over (planned), as the voice Worker logged it (wrangler
 * tail), the call ran well past its first session, our caller picked the message up after the hold
 * and kept answering the business (never leaving it waiting longer than QUIET_LIMIT_S), never
 * greeted it again and was never asked if it was still there, and the call wasn't ended by a voice
 * session.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { at, business, call, callsSinceStart, db, lines, printSides, sleep, untilAnswered, untilTalking, verdict, type Line } from './staging-api';

const SESSION_S = Number(readFileSync('wrangler.voice.staging.jsonc', 'utf8').match(/"VOICE_SESSION_SECONDS":\s*"(\d+)"/)?.[1]);
if (!SESSION_S) throw new Error('no VOICE_SESSION_SECONDS in wrangler.voice.staging.jsonc');
const MAX_MINUTES = 8;
const QUIET_LIMIT_S = 8;
// Speech runs about 2.5 words a second; a line's time is when it started.
const spokenMs = (text: string) => (text.split(/\s+/).length / 2.5) * 1000;
// A new session that didn't know the call would start it over with a hello.
const GREETING = /^(?:hi|hello|hey)\b/i;

const MESSAGE = [
  'From Jordan Avery', 'Unit 4B', 'Kitchen sink leaking since Thursday', 'Leak is under the cabinet, at the back',
  'A bucket is under it for now', 'The cabinet floor is getting soft', 'The shutoff valve is stuck', 'Gate code 4417',
  'Lockbox on the door, code 2290', 'A friendly dog named Biscuit', 'Biscuit stays in the bedroom', 'Mornings work best',
  'Tuesday 9 to 11 is ideal', 'Wednesday after 2 works too', 'Not Friday', 'Call before coming',
  'Callback 415 555 0123', 'Texts are fine', 'Bathroom fan is loud, not urgent', 'Hallway light by 4B is out',
  'Mailbox for 4B sticks', 'Jordan can send photos', 'Lease is under Avery', 'Second leak this year',
];
// The item the business holds after, and its line coming back (no "thanks for holding": a queue's
// recording says that too, so it doesn't end a hold).
const HOLD_AFTER = 'Mornings work best';
const BACK = "Okay, I'm back. Go ahead with the next item.";
// The hold runs past our caller's session's end, well into its rollover window, and at least HOLD_MIN_S.
const HOLD_UNTIL_S = SESSION_S + 10;
const HOLD_MIN_S = 30;
const HOLD = `When a caller leaving a message gives you the item "${HOLD_AFTER}", confirm it, then say "Hold on one second, let me check with Staging Tester." and hand off a question (ask_user) asking Staging Tester whether to keep taking the message. Say nothing more until the answer comes back. Then say "${BACK}" and keep taking the message.`;

const profile = await db.prepare('SELECT fields FROM profiles WHERE account_id = ?').bind(business.id).first<{ fields: string }>();
if (!profile) throw new Error('the staging business account has no profile');
const fields = JSON.parse(profile.fields) as Record<string, string>;
const setFields = (json: string) => db.prepare('UPDATE profiles SET fields = ? WHERE account_id = ?').bind(json, business.id).run();

// What the voice Worker logs about rollovers, for the whole run.
const tail = spawn('npx', ['wrangler', 'tail', '-c', 'wrangler.voice.staging.jsonc', '--format', 'pretty', '--search', 'voice session'], { stdio: ['ignore', 'pipe', 'pipe'] });
let tailed = '';
tail.stdout.on('data', (d: Buffer) => (tailed += d.toString()));
tail.stderr.on('data', (d: Buffer) => (tailed += d.toString()));

async function run(): Promise<number> {
  for (let i = 0; i < 30 && !/Connected to/i.test(tailed); i++) await sleep(1_000);
  if (!/Connected to/i.test(tailed)) throw new Error(`wrangler tail didn't connect:\n${tailed}`);
  await setFields(JSON.stringify({ ...fields, answering_instructions: [fields.answering_instructions, HOLD].filter(Boolean).join('\n') }));

  const placed = await call('POST', '/calls', {
    to: business.phone_number,
    business: 'Staging Rollover Test',
    goal: "Leave a detailed message for Staging Tester, one item of the list at a time: say one item, wait for them to repeat it back or say they've got it, then give the next. Never give two items at once. When every item is in, ask them to read the whole message back, and correct anything they got wrong. Do not hang up on your own.",
    category: 'general',
    details: { questions: `Whether they took down each item of the message:\n${MESSAGE.map((m, i) => `${i + 1}. ${m}`).join('\n')}` },
    timezone: 'America/Los_Angeles',
    max_minutes: MAX_MINUTES,
  });
  const callId: string = placed.id;
  console.log(`placed ${callId}: ${business.phone_number} (business) calling itself, ${MAX_MINUTES} minutes, voice sessions of ${SESSION_S}s`);
  await untilAnswered(callId, placed.status);
  const pickedUp = Date.now();
  console.log(`answered at ${at(pickedUp)}; letting the two assistants talk`);
  if (!(await untilTalking(callId))) {
    await call('POST', `/calls/${callId}/hang-up`).catch(() => {});
    console.log('INCONCLUSIVE  the two assistants never got talking: run it again');
    return 2;
  }

  // The business's question to its owner is the hold: answered once our caller's session is past due.
  let inbound: string | undefined;
  let asked: { id: string; at: number } | null = null;
  let heldUntil: number | null = null;
  let status = 'in_progress';
  for (let i = 0; i < (MAX_MINUTES + 3) * 30 && status === 'in_progress'; i++) {
    await sleep(2_000);
    status = (await call('GET', `/calls/${callId}`)).status;
    inbound ??= (await callsSinceStart([business.id])).find((r) => r.direction === 'inbound')?.id;
    if (!inbound || heldUntil) continue;
    const q = ((await call('GET', `/calls/${inbound}`)).open_questions ?? [])[0] as { id: string; question: string } | undefined;
    if (q && !asked) {
      asked = { id: q.id, at: Date.now() };
      console.log(`on hold at ${at(asked.at)}: the business asked "${q.question}"`);
    }
    if (asked && Date.now() >= Math.max(asked.at + HOLD_MIN_S * 1000, pickedUp + HOLD_UNTIL_S * 1000)) {
      await call('POST', `/calls/${inbound}/answer`, { question_id: asked.id, answer: 'Yes, keep taking the message.' });
      heldUntil = Date.now();
      console.log(`answered it at ${at(heldUntil)}: the business comes back`);
    }
  }
  if (status === 'in_progress') {
    await call('POST', `/calls/${callId}/hang-up`).catch(() => {});
    console.log(`FAIL  the call was still going ${MAX_MINUTES + 3} minutes in; hung it up`);
    return 1;
  }
  console.log(`ended at ${at(Date.now())} (${status}); reading transcripts and logs`);
  await sleep(10_000);

  const rows = await callsSinceStart([business.id]);
  const outbound = rows.find((r) => r.id === callId);
  printSides([['our caller', outbound], ['business (answering assistant)', rows.find((r) => r.direction === 'inbound')]]);
  const marks = tailed.split('\n').filter((l) => l.includes(`call ${callId}: `)).map((l) => l.trim());
  console.log(`\nour caller's voice sessions (wrangler tail):\n${marks.map((m) => `  ${m}`).join('\n') || '  (nothing logged)'}`);
  if (!heldUntil) {
    console.log(`\nINCONCLUSIVE  the business never put our caller on hold${asked ? ' long enough' : ''}: run it again`);
    return 2;
  }

  const answeredAt = outbound?.answered_at ?? 0;
  const lasted = ((outbound?.ended_at ?? 0) - (outbound?.answered_at ?? Infinity)) / 1000;
  const rolls = marks.filter((m) => m.includes('rolled over (planned)'));
  // When the first rollover happened, from its mark's "+Nms after answer".
  const rolledAt = answeredAt + Number(rolls[0]?.match(/\+(\d+)ms after answer/)?.[1] ?? Infinity);
  const spoken = lines(outbound).filter((l) => l.role === 'them' || l.role === 'caller');
  const waited = (l: Line, next: Line) => (next.at - (l.at + spokenMs(l.text))) / 1000;
  // Each time the business finished a turn and our caller answered it, how long that took. On
  // hold, our caller rightly says nothing to the business's "still waiting on them".
  const holdFrom = spoken.find((l) => l.role === 'them' && /\bhold on\b/i.test(l.text))?.at ?? heldUntil;
  const waits = spoken.flatMap((l, i) => (l.role === 'them' && spoken[i + 1]?.role === 'caller' && !(l.at >= holdFrom && l.at < heldUntil) ? [waited(l, spoken[i + 1])] : []));
  const longest = Math.max(0, ...waits);
  const back = spoken.findIndex((l) => l.role === 'them' && l.at >= heldUntil - 2_000 && /\bI'?m back\b/i.test(l.text));
  const resumed = back >= 0 ? spoken.slice(back + 1).find((l) => l.role === 'caller') : undefined;
  const greetings = spoken.filter((l) => l.role === 'caller' && l.at >= rolledAt && GREETING.test(l.text.trim())).length;
  const checked = spoken.filter((l) => l.role === 'them' && /\b(?:still there|are you there)\b/i.test(l.text)).length;
  const passed = verdict([
    [`our caller's voice session rolled over (planned) ${rolls.length} times`, rolls.length > 0],
    [`the call ran well past a voice session of ${SESSION_S}s (it lasted ${lasted.toFixed(0)}s)`, lasted >= 1.5 * SESSION_S],
    [
      `back from hold, our caller gave the next item${resumed ? ` ${waited(spoken[back], resumed).toFixed(1)}s later: "${resumed.text.slice(0, 60)}"` : ': it never did'}`,
      Boolean(resumed) && waited(spoken[back], resumed!) <= QUIET_LIMIT_S && !/mornings/i.test(resumed!.text),
    ],
    [`our caller never left the business waiting more than ${QUIET_LIMIT_S}s (longest ${longest.toFixed(1)}s)`, longest <= QUIET_LIMIT_S],
    [`our caller never greeted them again after rolling over (${greetings} times)`, greetings === 0],
    [`the business never asked if our caller was still there (${checked} times)`, checked === 0],
    [`the call wasn't ended by a voice session (${outbound?.end_reason ?? 'no reason'})`, !/voice (?:model|session)/.test(outbound?.end_reason ?? '')],
  ]);
  console.log(`\nLOGS  cflogs query -w call4me-voice-staging --from ${new Date(answeredAt || Date.now()).toISOString()} --to ${new Date(Date.now()).toISOString()} -q "${callId}: "`);
  return passed ? 0 : 1;
}

let code = 1;
try {
  code = await run();
} finally {
  tail.kill();
  await setFields(profile.fields);
}
process.exit(code);
