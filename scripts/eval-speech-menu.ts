/**
 * Opt-in model evaluation of how the caller answers a phone menu that listens for speech. No phone
 * call is placed: real menus' prompts, word for word from customers' calls, are synthesized and
 * streamed into a GPT-Live session at the phone's pace, as 8 kHz μ-law with silence between, under
 * the instructions and back office a real call gets. Each prompt waits for the caller to finish
 * answering; keys it presses are accepted.
 *
 *   npm run test:speech-menu:live [-- --runs 3] [-- --menu ge]      (EVAL_DEBUG=1 prints GPT-Live's events)
 *
 * FedEx (erario's call_uno1pgc92mnnhbd6 and call_ase98sji3e1w7iu4, Nov 18): the caller answered
 * "You're calling to change a delivery address, right" with "Right, yeah. Uh, one moment while I
 * pull up the tracking. No, I'm just asking for guidance", and the menu's recognizer asked again
 * and again until the user hung up. GE Appliances (Kate's call_ldb8bzvlopko2yzl, Nov 25): "Mm-hmm"
 * over its greeting, "Okay. Schedule a repair." got "Sorry, I didn't get that", and "Hmm. No." got
 * "That input was invalid". Each prompt here is scored on what such a recognizer can take, and on
 * the caller keeping quiet while the recording plays. Needs OPENAI_API_KEY (or .dev.vars) and ffmpeg on PATH.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { BACK_OFFICE_TOOLS, backOfficeInstructions, callInstructions, type CallBrief } from '../src/server/voice/prompt';
import { pcmuAudible, pcmuMs } from '../src/server/voice/dtmf';
import { FillerGate, type GateOut } from '../src/server/voice/filler-gate';
import { MenuRecovery } from '../src/server/voice/handoff';
import { MACHINE_GUIDANCE } from '../src/server/voice/voicemail';

if (!process.env.OPENAI_API_KEY && existsSync('.dev.vars')) loadEnvFile('.dev.vars');
const key = process.env.OPENAI_API_KEY;
assert.ok(key, 'OPENAI_API_KEY is required');
const configured = (name: string) => readFileSync('wrangler.voice.jsonc', 'utf8').match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`))?.[1];
const voiceModel = configured('VOICE_MODEL');
const backOfficeModel = configured('BACK_OFFICE_MODEL');
assert.ok(voiceModel && backOfficeModel, 'VOICE_MODEL and BACK_OFFICE_MODEL must be configured in wrangler.voice.jsonc');
const runsAt = process.argv.indexOf('--runs');
const runs = runsAt > 0 ? Number(process.argv[runsAt + 1]) : 3;
assert.ok(Number.isInteger(runs) && runs > 0, '--runs takes a positive whole number');
const menuAt = process.argv.indexOf('--menu');
const only = menuAt > 0 ? process.argv[menuAt + 1] : null;

/** erario's brief with someone else's shipment in it. */
const fedexBrief: CallBrief = {
  onBehalfOf: 'Sam Rivera', owner: 'Sam Rivera', business: 'FedEx', assistantName: null, callingAs: null,
  goal: 'Reach a live FedEx representative for guidance on a same-apartment address correction for tracking 123456789012. The opening recorded greeting is an interactive phone menu. Let it finish, continue through the menu, and request a representative. No account or shipment changes.',
  facts: 'what to find out: Confirm whether FedEx can correct the street and unit formatting at the same delivery address on this Ground shipment, who may request it, and how. If the shipper must act, ask for the exact procedure and any deadline or fee. Ask only for information.\ntracking number: 123456789012\nWe are calling for the recipient, not the shipper. Recorded ship-to street and unit: 1530 Main St UNT 110. Standard address for the same apartment: 1530 Main St Apt 110, Boulder, CO 80303.',
  flexibility: "After the greeting, say 'address correction' or 'representative'; use 0 if the active phone menu offers it, or use 'track a package', provide 123456789012, and ask for a representative when prompted. Do not authorize any delivery change, redirect, hold, or charge.",
  callbackNumber: '+12025550100', callbackRingsOwner: false, localTime: 'Wednesday, November 18, 2026, 3:19 PM', today: 'Wednesday, November 18, 2026',
  connectWhen: null, voice: 'marin',
};

/** Kate's brief, with the details changed: the purchase date is known here, so the menu's question has one true answer. */
const geBrief: CallBrief = {
  ...fedexBrief,
  onBehalfOf: 'Kate Morgan', owner: 'Kate Morgan', business: 'GE Appliances',
  goal: "Get a repair scheduled, or the approved repair path, for Kate's GE dishwasher: the factory spot welds holding the upper water conduit bracket to the tub ceiling have failed and the conduit hangs loose. Ask whether it's covered as a factory defect.",
  facts: 'appliance: GE dishwasher, model GDT650SYV0FS, serial ZA123456B\npurchased: March 2022, more than twelve months ago\nphone number on file: 415-555-0188',
  flexibility: "No purchases, paid service appointments or charges authorized. A free repair kit is fine. Identify as the assistant acting on the owner's behalf.",
  localTime: 'Wednesday, November 25, 2026, 4:52 PM',
  today: 'Wednesday, November 25, 2026',
};

const FILLER = /\b(u+h+|u+m+|h+m+|m+h*m+|a+h+|o+h+|okay|ok|right|yeah|sure|gotcha|got it|one moment)\b/i;
const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
/**
 * What reached the menu after a prompt: words and keys, and the words heard while the prompt was
 * still playing. `raw` is everything the voice model said, before the call's filler gate (filler-gate.ts).
 */
type Reply = { said: string; keys: string[]; during: string; raw: string };
type Prompt = { menu: string; check?: { name: string; ok: (r: Reply) => boolean } };
/** "say yes or press 1": the word alone, or the key. */
const yesOrNo = (want?: 'yes' | 'no', keys: Record<string, 'yes' | 'no'> = {}) => (r: Reply) => {
  const said = words(r.said);
  const answer = said.length === 1 && (said[0] === 'yes' || said[0] === 'no') ? said[0] : null;
  const keyed = !said.length && r.keys.length === 1 ? keys[r.keys[0]] : undefined;
  // Both is two answers: the key lands in whatever the menu asks next.
  const given = r.keys.length ? keyed : answer;
  return given != null && (!want || given === want);
};

/** Just the words of one option the menu offered: what a speech recognizer matches. */
const option = (...offered: string[]) => (r: Reply) => !r.keys.length && offered.includes(words(r.said).join(' '));

/** FedEx's prompts in the order its menu played them on erario's calls. */
const fedex: Prompt[] = [
  { menu: 'Welcome to FedEx. This call may be monitored or recorded for quality assurance. Tell me what I can help you with today.',
    check: { name: 'open question: the reason in a sentence, no filler', ok: (r) => !r.keys.length && words(r.said).length > 0 && words(r.said).length <= 20 && !FILLER.test(r.said) } },
  { menu: "You're calling to change a delivery address, right?",
    check: { name: 'confirmation: a bare yes or no', ok: yesOrNo() } },
  { menu: "Sorry, if you're calling to change a delivery address, say yes or press 1. If not, say no or press 2.",
    check: { name: 'yes or press 1: a bare yes or no, or the key', ok: yesOrNo(undefined, { 1: 'yes', 2: 'no' }) } },
  { menu: 'Okay. Please tell me either your tracking number or your door tag number.',
    check: { name: 'tracking number: keyed in without a word', ok: (r) => r.keys.join('') === '123456789012' && !words(r.said).length } },
  { menu: "You don't have one. Is that right? Please say yes or no.",
    check: { name: 'misheard: a bare no', ok: yesOrNo('no') } },
  { menu: "My mistake. Please say or enter your tracking or door tag number one digit at a time. Or, if you're unsure where to find it, say, help me find it, or press star.",
    check: { name: 'say or enter: keyed in', ok: (r) => r.keys.join('') === '123456789012' } },
  { menu: 'And are you the shipper?',
    check: { name: 'are you the shipper: a bare no', ok: yesOrNo('no') } },
  { menu: 'Only the shipper is authorized to make changes to the address of a shipment. To redirect the shipment to a FedEx location for pickup the next business day, say hold this shipment. Otherwise, to change the address of the shipment, please ask the shipper to give us a call.',
    check: { name: 'dead end: ask for a person, no filler', ok: (r) => /\b(representative|agent|person|someone)\b/i.test(r.said) && !FILLER.test(r.said) } },
];

/** GE Appliances' speech menu as it played on Kate's call, greeting first. */
const ge: Prompt[] = [
  { menu: "Thank you for calling GE Appliances Consumer Relations. We're happy to help you, and want to make sure your call is routed appropriately for the fastest resolution. Calls may be monitored or recorded for quality assurance. By giving or confirming your phone number, you consent to us calling or texting you. How can I help you today? You can say things like, purchase a new appliance, shopping assistance, schedule a repair, parts and accessories, or something else.",
    check: { name: 'offered options: just the option words', ok: option('schedule a repair', 'something else') } },
  { menu: 'Please tell me what type of appliance you are calling about. You can say things like dishwasher or dryer.',
    check: { name: 'what appliance: just the word', ok: option('dishwasher') } },
  { menu: 'Was your appliance purchased within the last twelve months?',
    check: { name: 'purchased in the last twelve months: a bare no', ok: yesOrNo('no') } },
];

const MENUS: Record<string, { brief: CallBrief; prompts: Prompt[] }> = { fedex: { brief: fedexBrief, prompts: fedex }, ge: { brief: geBrief, prompts: ge } };
assert.ok(!only || MENUS[only], `--menu takes one of: ${Object.keys(MENUS).join(', ')}`);

/**
 * What the menu hears of a reply. Once a prompt offers keys, the call keeps the caller's voice off
 * the line until a key goes in and the menu answers it (VoiceSession.menuHoldsCaller), so only keys
 * reach it there.
 */
function heard(menu: string, r: Reply): Reply {
  const recovery = new MenuRecovery();
  recovery.observe(menu, Date.now());
  return recovery.awaitingKey() ? { ...r, said: '', during: '' } : r;
}

const work = mkdtempSync(join(tmpdir(), 'speech-menu-'));
const SILENCE = Buffer.alloc(160, 0xff);
/** A prompt as the phone hears it: 8 kHz μ-law in 20ms frames. */
async function speech(text: string, i: number): Promise<Buffer[]> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'coral', input: text, instructions: 'An automated phone menu: clear, even and unhurried.', response_format: 'wav' }),
  });
  if (!res.ok) throw new Error(`speech for prompt ${i} failed: ${res.status} ${await res.text()}`);
  const wav = join(work, `${i}.wav`);
  writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
  const ulaw = join(work, `${i}.ulaw`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-ar', '8000', '-ac', '1', '-f', 'mulaw', ulaw]);
  const audio = readFileSync(ulaw);
  const frames: Buffer[] = [];
  for (let at = 0; at < audio.length; at += 160) frames.push(Buffer.concat([audio.subarray(at, at + 160), SILENCE]).subarray(0, 160));
  return frames;
}

/**
 * A menu takes the caller's answer as done once it has been quiet this long, as speech recognizers
 * do, and moves on without one this long after its prompt. The caller is quiet once the audible
 * audio it sent would have finished playing (GPT-Live streams silence the whole session, faster
 * than it plays), and once its last key went in.
 */
const DONE_QUIET_MS = 1_200;
const NO_REPLY_MS = 10_000;

/** One call through the whole menu: what the caller said and keyed after each prompt. */
function call(brief: CallBrief, audio: Buffer[][]): Promise<Reply[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://api.openai.com/v1/live/sessions', { headers: { authorization: `Bearer ${key}` } } as never);
    const replies: Reply[] = audio.map(() => ({ said: '', keys: [], during: '', raw: '' }));
    // The call's filler gate, on over the greeting until the caller's first word and from the
    // carrier's automated-greeting verdict on (VoiceSession.holdsFiller).
    const gate = new FillerGate();
    let machine = false;
    let spoke = false;
    const holdsFiller = () => machine || !spoke;
    const onLine = (words: string) => {
      if (turn < 0 || turn >= audio.length || !words) return;
      spoke = true;
      replies[turn].said += words;
      // Words lead their audio by about 200ms: these are heard over the prompt's last half second or earlier.
      if (audibleLeft * 20 > 500) replies[turn].during += words;
    };
    const take = (out: GateOut) => onLine(out.words);
    let turn = -1;
    let queue: Buffer[] = [];
    /** The current prompt's audible frames not yet sent. */
    let audibleLeft = 0;
    let promptEndedAt = 0;
    let lastCallerAt = 0;
    let playsUntil = 0;
    let feeder: ReturnType<typeof setInterval> | undefined;
    /** EVAL_DEBUG: when each turn's first audible audio and first words arrived, to see which leads. */
    let firstAudioAt = 0;
    let firstTextAt = 0;
    /** EVAL_DEBUG=2: the caller's audio as runs of sound and silence, with its words where they arrived. */
    let trace = '';
    let traceAudible: boolean | null = null;
    let traceMs = 0;
    const traceFlush = () => {
      if (traceAudible !== null && traceMs) trace += `${traceAudible ? '#' : '_'}${traceMs} `;
      traceMs = 0;
    };
    const timeout = setTimeout(() => finish(new Error('the call took over 4 minutes')), 240_000);
    const finish = (err?: Error) => {
      clearTimeout(timeout);
      clearInterval(feeder);
      ws.close();
      if (err) reject(err);
      else resolve(replies);
    };
    const next = () => {
      turn++;
      if (turn === audio.length) return finish();
      queue = [...audio[turn]];
      audibleLeft = queue.findLastIndex((f) => pcmuAudible(f.toString('base64'))) + 1;
      if (process.env.EVAL_DEBUG && firstAudioAt && firstTextAt) console.log(`    [${turn - 1}] first words ${firstTextAt - firstAudioAt}ms after first audible audio`);
      firstAudioAt = firstTextAt = 0;
      traceFlush();
      if (process.env.EVAL_DEBUG === '2' && trace) console.log(`    [${turn - 1}] ${trace.replace(/(_\d+ )+$/, '')}`);
      trace = '';
      traceAudible = null;
      promptEndedAt = 0;
      lastCallerAt = 0;
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
    ws.addEventListener('error', () => finish(new Error('the live socket failed')));
    ws.addEventListener('close', (ev) => { if (turn < audio.length) finish(new Error(`the live socket closed (${ev.code} ${ev.reason})`)); });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (process.env.EVAL_DEBUG && msg.type !== 'session.output_audio.delta') console.log(`    [${turn}] ${msg.type} ${msg.delta ?? msg.event?.type ?? ''}`);
      if (msg.type === 'session.started') {
        next();
        // Five frames every 100ms: the phone's pace, which GPT-Live holds input to.
        feeder = setInterval(() => {
          const now = Date.now();
          for (let n = 0; n < 5; n++) ws.send(JSON.stringify({ type: 'session.input_audio.append', audio: (queue.shift() ?? SILENCE).toString('base64') }));
          audibleLeft = Math.max(0, audibleLeft - 5);
          if (queue.length) return;
          promptEndedAt ||= now;
          const answered = replies[turn].raw.trim() || replies[turn].keys.length;
          if ((answered && lastCallerAt && now - Math.max(lastCallerAt, promptEndedAt) > DONE_QUIET_MS) || (!answered && now - promptEndedAt > NO_REPLY_MS)) next();
        }, 100);
        // As on erario's calls, the carrier's answering-machine verdict lands during the greeting.
        setTimeout(() => {
          ws.send(JSON.stringify({ type: 'session.commentary.append', delegation_id: null, content: MACHINE_GUIDANCE.machine }));
          machine = true;
        }, 4_000);
      } else if (msg.type === 'session.output_transcript.delta' && turn >= 0 && turn < audio.length) {
        replies[turn].raw += msg.delta;
        if (holdsFiller()) onLine(gate.hear(msg.delta));
        else {
          take(gate.flush());
          onLine(msg.delta);
        }
        if (msg.delta.trim()) firstTextAt ||= Date.now();
        if (firstAudioAt || msg.delta.trim()) {
          traceFlush();
          trace += `«${msg.delta}» `;
        }
      } else if (msg.type === 'session.output_audio.delta') {
        playsUntil = Math.max(playsUntil, Date.now()) + pcmuMs(msg.delta);
        const audible = pcmuAudible(msg.delta);
        take(holdsFiller() ? gate.audio(msg.delta, audible) : gate.flush());
        if (audible) {
          lastCallerAt = playsUntil;
          firstAudioAt ||= Date.now();
        }
        if (firstAudioAt || firstTextAt) {
          if (traceAudible !== audible) traceFlush();
          traceAudible = audible;
          traceMs += pcmuMs(msg.delta);
        }
      } else if (msg.type === 'response.event' && msg.event?.type === 'response.output_item.done' && msg.event.item?.type === 'function_call') {
        const item = msg.event.item;
        const args = JSON.parse(item.arguments || '{}');
        if (item.name === 'press_digits' && turn >= 0 && turn < audio.length) replies[turn].keys.push(String(args.digits));
        else if (turn >= 0 && turn < audio.length) {
          replies[turn].said += ` [${item.name} ${item.arguments}]`;
          replies[turn].raw += ` [${item.name} ${item.arguments}]`;
        }
        lastCallerAt = Date.now();
        const output = item.name === 'press_digits' ? `keypad submitted: ${args.digits}; wait for the next prompt to confirm it worked` : 'not available in this evaluation';
        ws.send(JSON.stringify({ type: 'response.item.create', item: { type: 'function_call_output', call_id: item.call_id, output } }));
        ws.send(JSON.stringify({ type: 'response.create' }));
      } else if (msg.type === 'error') {
        console.warn(`  gpt-live error: ${msg.error?.code} ${msg.error?.message}`);
      } else if (msg.type === 'session.closed') {
        finish(new Error(`the session closed (${msg.reason})`));
      }
    });
  });
}

const tally = new Map<string, { passed: number; total: number }>();
const count = (name: string, ok: boolean) => {
  const t = tally.get(name) ?? { passed: 0, total: 0 };
  tally.set(name, { passed: t.passed + (ok ? 1 : 0), total: t.total + 1 });
};
for (const [name, { brief, prompts }] of Object.entries(MENUS)) {
  if (only && name !== only) continue;
  const audio = await Promise.all(prompts.map((p, i) => speech(p.menu, i)));
  for (let run = 1; run <= runs; run++) {
    console.log(`\n${name}: run ${run} of ${runs}`);
    const replies = await call(brief, audio);
    prompts.forEach((p, i) => {
      const r = replies[i];
      const menuHeard = heard(p.menu, r);
      const muted = r.said.trim() && !menuHeard.said ? ' (voice kept off a keypad menu)' : '';
      const gated = r.raw.trim() !== r.said.trim() && !muted ? ` (said "${r.raw.trim()}"; the filler gate kept the rest off the line)` : '';
      const line = `${r.said.trim() || '(nothing said)'}${r.keys.length ? ` [keys ${r.keys.join(' ')}]` : ''}${muted}${gated}`;
      // Over a recording, "mm-hmm" is noise at best, and a menu that listens takes it as the answer.
      const quiet = !words(menuHeard.during).length;
      count(`${name}: quiet while the recording plays`, quiet);
      const during = quiet ? '' : `\n          over the recording: ${menuHeard.during.trim()}`;
      if (!p.check) return console.log(`        menu: ${p.menu.slice(0, 60)}...\n          caller: ${line}${during}`);
      const ok = p.check.ok(menuHeard);
      count(`${name}: ${p.check.name}`, ok);
      console.log(`  ${ok && quiet ? 'PASS' : 'FAIL'}  menu: ${p.menu.slice(0, 60)}...\n          caller: ${line}${during}`);
    });
  }
}
console.log('\nsummary');
for (const [name, t] of tally) console.log(`  ${t.passed}/${t.total}  ${name}`);
const failed = [...tally.values()].some((t) => t.passed < t.total);
process.exitCode = failed ? 1 : 0;
