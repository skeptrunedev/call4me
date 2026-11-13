/**
 * End-to-end test of joining a live call (call4me_connect_me), on staging, with nobody's phone.
 *
 *   npm run staging:connect-test [-- --listen] [--wait <seconds>] [--person <+phone>]
 *
 * Staging (wrangler.staging.jsonc) has two numbers, each answered by staging's own assistant:
 * staging-test@call4.me's number plays the business, and staging-person@call4.me's number plays
 * the person who joins (its greeting says "this is the person joining the call"). The test places
 * a call from the business account to its own number, waits for the two assistants to talk, joins
 * the person's number the way call4me_connect_me does, then hangs up and reads both assistants'
 * transcripts: what each one heard is what came through the call. It passes when the business
 * heard what the person's assistant said, the person heard the business, and our caller kept
 * talking once they joined
 * (with --listen, when the person heard the business and the business did not hear them).
 *
 * --person joins a real phone instead of staging's person number, to check a customer's own line:
 * it rings from staging-test@call4.me's number, and the test passes when the business heard
 * anything from that phone after the join. Whether they heard the business, ask them.
 *
 * Mints a fresh API key for the staging business account on each run (staging's D1 only).
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cliD1 } from './d1-cli';

const args = process.argv.slice(2);
const listen = args.includes('--listen');
const waitIndex = args.indexOf('--wait');
const joinedSeconds = waitIndex >= 0 ? Number(args[waitIndex + 1]) : 40;
const personIndex = args.indexOf('--person');
const realPhone = personIndex >= 0 ? args[personIndex + 1] : null;
if (realPhone !== null && !/^\+[1-9]\d{7,14}$/.test(realPhone)) throw new Error(`--person takes a phone number like +14155550123, not ${realPhone}`);
const BUSINESS = 'staging-test@call4.me';
const PERSON = 'staging-person@call4.me';

const host = readFileSync('wrangler.staging.jsonc', 'utf8').match(/"CANONICAL_HOST":\s*"([^"]+)"/)?.[1];
if (!host) throw new Error('no CANONICAL_HOST in wrangler.staging.jsonc');
const api = `https://${host}/api`;
const db = cliD1('--remote', 'staging');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const at = (ms: number) => `${((ms - t0) / 1000).toFixed(1)}s`;

const numberOf = async (email: string) => {
  const row = await db.prepare(`SELECT a.id, n.phone_number FROM accounts a JOIN numbers n ON n.account_id = a.id AND n.status = 'active' WHERE a.email = ?`).bind(email).first<{ id: string; phone_number: string }>();
  if (!row) throw new Error(`${email} has no active number on staging`);
  return row;
};
const business = await numberOf(BUSINESS);
const person = realPhone ? null : await numberOf(PERSON);
const personPhone = realPhone ?? person!.phone_number;

// Same key shape and hash as lib/keys.ts newApiKey/sha256Hex.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const key = `cb_live_${[...randomBytes(32)].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
await db.prepare(`UPDATE accounts SET key_hash = ?, key_prefix = ?, key_sealed = NULL WHERE id = ?`).bind(createHash('sha256').update(key).digest('hex'), `${key.slice(0, 12)}…`, business.id).run();

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${api}${path}`, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as any;
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error ?? res.status}`);
  return json;
}

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

let status = placed.status as string;
for (let i = 0; i < 40 && status !== 'in_progress'; i++) {
  await sleep(1500);
  status = (await call('GET', `/calls/${callId}`)).status;
  if (['completed', 'failed', 'no_answer', 'busy'].includes(status)) throw new Error(`the call ended before it was answered: ${status}`);
}
if (status !== 'in_progress') throw new Error(`the call never connected (status ${status})`);
console.log(`answered at ${at(Date.now())}; letting the two assistants talk`);
await sleep(12_000);

const joinAt = Date.now();
const connected = await call('POST', `/calls/${callId}/connect`, { phone: personPhone, mode: listen ? 'listen' : 'join' });
console.log(`${listen ? 'listening' : 'joining'} ${personPhone} (person) at ${at(joinAt)}: ${connected.message}`);
await sleep(joinedSeconds * 1000);
await call('POST', `/calls/${callId}/hang-up`).catch((err) => console.log(`hang up: ${err.message}`));
console.log(`hung up at ${at(Date.now())}; reading transcripts`);
await sleep(8_000);

interface Row { id: string; account_id: string; direction: string; status: string; end_reason: string | null; answered_at: number | null; transcript: string | null }
const { results: rows } = await db
  .prepare(`SELECT id, account_id, direction, status, end_reason, answered_at, transcript FROM calls WHERE created_at >= ? AND account_id IN (?, ?) ORDER BY created_at`)
  .bind(t0 - 5_000, business.id, person?.id ?? business.id)
  .all<Row>();
const lines = (r?: Row) => (r?.transcript ? (JSON.parse(r.transcript) as { role: string; text: string; at: number }[]) : []);
const outbound = rows.find((r) => r.id === callId);
const businessSide = rows.find((r) => r.direction === 'inbound' && r.account_id === business.id);
const personSide = person ? rows.find((r) => r.direction === 'inbound' && r.account_id === person.id) : undefined;

const sides: [string, Row | undefined][] = [['our caller', outbound], ['business (answering assistant)', businessSide]];
if (person) sides.push(['person (answering assistant)', personSide]);
for (const [label, r] of sides) {
  console.log(`\n${label}: ${r ? `${r.id} ${r.status}${r.end_reason ? `, ${r.end_reason}` : ''}` : 'no call recorded'}`);
  for (const l of lines(r)) console.log(`  ${at(l.at).padStart(7)} ${l.role.padEnd(6)} ${l.text.slice(0, 140)}`);
}

// What each assistant heard after the join is its "them" lines from then on. Our caller keeps
// talking once the person joins, so the business heard the person when something the person's
// assistant said shows up in what the business heard. A real phone has no assistant to compare
// with, so any speech after the join counts.
const heardAfterJoin = (r?: Row) => lines(r).filter((l) => l.role === 'them' && l.at >= joinAt).map((l) => l.text);
const words = (t: string) => t.toLowerCase().match(/[a-z']+/g) ?? [];
const businessHeard = new Set(heardAfterJoin(businessSide).flatMap(words));
const personSaid = lines(personSide).filter((l) => l.role === 'caller').map((l) => words(l.text)).filter((w) => w.length >= 4);
const businessHeardPerson = realPhone
  ? heardAfterJoin(businessSide).length > 0
  : personSaid.some((w) => w.filter((x) => businessHeard.has(x)).length >= 0.7 * w.length);
const personHeard = heardAfterJoin(personSide).length > 0;
const joined = lines(outbound).some((l) => l.role === 'note' && /joined the call|is listening in/.test(l.text));
const joinedAt = lines(outbound).find((l) => l.role === 'note' && /joined the call|is listening in/.test(l.text))?.at ?? Infinity;
const callerKeptTalking = lines(outbound).some((l) => l.role === 'caller' && l.at > joinedAt);
const verdict = [
  [`the person's phone ${listen ? 'started listening' : 'joined'}`, joined],
  ...(realPhone ? [] : [['the person heard the business', personHeard] as const]),
  [listen ? 'the business did not hear the person' : 'the business heard the person', listen ? !businessHeardPerson : businessHeardPerson],
  ['our caller kept talking after they came on', callerKeptTalking],
] as const;
console.log('');
for (const [check, ok] of verdict) console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}`);
if (realPhone) console.log('ASK   whether they heard the business (staging\'s assistant) after picking up');
process.exit(verdict.every(([, ok]) => ok) ? 0 : 1);
