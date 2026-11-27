/**
 * Opt-in model evaluation of whether the caller hears a greeting said the moment the phone is
 * picked up. No call is placed: a finished call's recording is streamed into a GPT-Live session
 * under that call's instructions, at the phone's pace, once the session has waited out a ring as a
 * real call's does. `--lead cold` sends nothing while it rings, as the session does (onPhoneFrame
 * passes no audio before pickup), so the greeting is the first audio GPT-Live gets; `--lead silence`
 * streams the ring's silence first.
 *
 * Trattoria La Foglia picked up calls on Nov 27 with "Pronto" (call_sc3310ad9o2t4t5a,
 * call_uj2lesudne1mjh26, call_apohgsgjlbud8q47): it never reached the transcript and the caller
 * never answered it, on a quiet line as on a noisy one. Replayed from their recordings, GPT-Live
 * heard it and answered in 28 of 28 runs, cold or after the ring's silence: what it got on the
 * calls was not what Telnyx recorded. The first phone frame arrives 300ms or so after the answered
 * webhook (calls.audio_at - answered_at, on every route), and a recording starts at pickup; losing
 * the start of a half-second greeting loses the greeting.
 *
 *   npx tsx scripts/eval-pickup-greeting.ts --call-id <id> --wav <recording> [--seconds 8] [--runs 3] [--lead cold|silence|both]
 *
 * The recording must hold only their side for --seconds: the call's own, up to the caller's first
 * words (scripts/review-call-audio.ts fetch saves it outside the repository). Needs OPENAI_API_KEY
 * (or .dev.vars), ffmpeg on PATH and wrangler access to the database.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { BACK_OFFICE_TOOLS, backOfficeInstructions, callInstructions, type CallBrief } from '../src/server/voice/prompt';
import { pcmuAudible } from '../src/server/voice/dtmf';
import { localTimeIn, todayUtc } from '../src/server/services/calls';
import { cliD1 } from './d1-cli';

if (!process.env.OPENAI_API_KEY && existsSync('.dev.vars')) loadEnvFile('.dev.vars');
const key = process.env.OPENAI_API_KEY;
assert.ok(key, 'OPENAI_API_KEY is required');
const configured = (name: string) => readFileSync('wrangler.voice.jsonc', 'utf8').match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`))?.[1];
const voiceModel = configured('VOICE_MODEL');
const backOfficeModel = configured('BACK_OFFICE_MODEL');
assert.ok(voiceModel && backOfficeModel, 'VOICE_MODEL and BACK_OFFICE_MODEL must be configured in wrangler.voice.jsonc');

const { values } = parseArgs({ options: { 'call-id': { type: 'string' }, wav: { type: 'string' }, seconds: { type: 'string', default: '8' }, runs: { type: 'string', default: '3' }, lead: { type: 'string', default: 'both' } } });
assert.ok(values['call-id'] && values.wav, '--call-id and --wav are required');
const seconds = Number(values.seconds);
const runs = Number(values.runs);
assert.ok(seconds > 0 && Number.isInteger(runs) && runs > 0, '--seconds takes a positive number and --runs a positive whole number');
assert.ok(['cold', 'silence', 'both'].includes(values.lead!), '--lead is cold, silence or both');
const leads = values.lead === 'both' ? (['cold', 'silence'] as const) : [values.lead as 'cold' | 'silence'];

/** The call's brief as the dialer builds it (services/dialer.ts), without the profile's voice, accent and assistant name. */
type Stored = { on_behalf_of: string; facts: string; flexibility: string; timezone: string | null; connect_when?: string | null; callback_number?: string | null };
const row = await cliD1().prepare('SELECT business, goal, brief, from_number FROM calls WHERE id = ?').bind(values['call-id']).first<{ business: string; goal: string; brief: string; from_number: string }>();
assert.ok(row, 'no such call');
const stored = JSON.parse(row.brief) as Stored;
const brief: CallBrief = {
  onBehalfOf: stored.on_behalf_of, owner: stored.on_behalf_of, business: row.business, goal: row.goal, facts: stored.facts, flexibility: stored.flexibility,
  callbackNumber: stored.callback_number ?? row.from_number, callbackRingsOwner: false, localTime: localTimeIn(stored.timezone), today: todayUtc(),
  assistantName: null, callingAs: null, connectWhen: stored.connect_when ?? null, voice: 'marin',
};

const SILENCE = Buffer.alloc(160, 0xff);
const work = mkdtempSync(join(tmpdir(), 'pickup-greeting-'));
const ulaw = join(work, 'their-side.ulaw');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', values.wav!, '-t', String(seconds), '-ar', '8000', '-ac', '1', '-f', 'mulaw', ulaw]);
const audio = readFileSync(ulaw);
const theirs: Buffer[] = [];
for (let at = 0; at < audio.length; at += 160) theirs.push(Buffer.concat([audio.subarray(at, at + 160), SILENCE]).subarray(0, 160));

/** How long the session waits before pickup, as a call's does while it rings, and how long the caller has to answer once their side ends. */
const RING_MS = 10_000;
const AFTER_MS = 6_000;

type Run = { heard: string; firstHeardMs: number | null; said: string; firstSpokeMs: number | null };

/** One pickup: what reached their transcript and when the caller first spoke, in ms after pickup. */
function pickup(lead: 'cold' | 'silence'): Promise<Run> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://api.openai.com/v1/live/sessions', { headers: { authorization: `Bearer ${key}` } } as never);
    const run: Run = { heard: '', firstHeardMs: null, said: '', firstSpokeMs: null };
    let pickedUpAt = 0;
    let queue: Buffer[] = [];
    let feeder: ReturnType<typeof setInterval> | undefined;
    let ring: ReturnType<typeof setTimeout> | undefined;
    const done = (err?: Error) => {
      clearInterval(feeder);
      clearTimeout(ring);
      ws.close();
      if (err) reject(err);
      else resolve(run);
    };
    const since = () => (pickedUpAt ? Date.now() - pickedUpAt : null);
    // Five frames every 100ms: the phone's pace, which GPT-Live holds input to.
    const feed = (frames: () => Buffer | undefined) => {
      clearInterval(feeder);
      feeder = setInterval(() => {
        for (let n = 0; n < 5; n++) ws.send(JSON.stringify({ type: 'session.input_audio.append', audio: (frames() ?? SILENCE).toString('base64') }));
      }, 100);
    };
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'session.start',
        session: {
          model: voiceModel, instructions: callInstructions(brief),
          audio: { format: { type: 'audio/pcmu', rate: 8000 }, output: { voice: brief.voice } },
          delegation: { type: 'responses', responses: { model: backOfficeModel, instructions: backOfficeInstructions(brief), tools: BACK_OFFICE_TOOLS, tool_choice: 'auto', parallel_tool_calls: false, reasoning: { effort: 'low' }, text: { verbosity: 'low' } } },
        },
      }));
    });
    ws.addEventListener('error', () => done(new Error('the live socket failed')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (process.env.EVAL_DEBUG && msg.type !== 'session.output_audio.delta') console.log(`    ${since() ?? 'ring'} ${msg.type} ${msg.delta ?? ''}`);
      if (msg.type === 'session.started') {
        if (lead === 'silence') feed(() => undefined);
        ring = setTimeout(() => {
          pickedUpAt = Date.now();
          queue = [...theirs];
          feed(() => queue.shift());
          ring = setTimeout(() => done(), (theirs.length * 20) + AFTER_MS);
        }, RING_MS);
      } else if (msg.type === 'session.input_transcript.delta' && pickedUpAt) {
        if (msg.delta.trim()) run.firstHeardMs ??= since();
        run.heard += msg.delta;
      } else if (msg.type === 'session.output_transcript.delta' && pickedUpAt) {
        run.said += msg.delta;
      } else if (msg.type === 'session.output_audio.delta' && pickedUpAt && pcmuAudible(msg.delta)) {
        run.firstSpokeMs ??= since();
      } else if (msg.type === 'error') {
        console.warn(`  gpt-live error: ${msg.error?.code} ${msg.error?.message}`);
      } else if (msg.type === 'session.closed') {
        done(new Error(`the session closed (${msg.reason})`));
      }
    });
  });
}

const greetingEnds = theirs.findIndex((f, i) => i > 0 && !pcmuAudible(f.toString('base64')) && theirs.slice(i, i + 10).every((g) => !pcmuAudible(g.toString('base64'))));
console.log(`${values['call-id']}: ${theirs.length * 20}ms of their side, first sound ends at ${greetingEnds * 20}ms; ${runs} run(s) per lead\n`);
for (const lead of leads) {
  let answered = 0;
  for (let i = 0; i < runs; i++) {
    const r = await pickup(lead);
    if (r.firstSpokeMs !== null) answered++;
    console.log(`  ${lead.padEnd(7)} run ${i + 1}: heard ${r.firstHeardMs ?? '-'}ms «${r.heard.trim().slice(0, 80)}»  spoke ${r.firstSpokeMs ?? '-'}ms «${r.said.trim().slice(0, 80)}»`);
  }
  console.log(`  ${lead}: the caller spoke in ${answered}/${runs}\n`);
}
