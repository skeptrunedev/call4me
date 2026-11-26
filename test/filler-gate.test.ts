import assert from 'node:assert/strict';
import test from 'node:test';
import { FillerGate, judge, type GateOut } from '../src/server/voice/filler-gate';

// GPT-Live's audio as 100ms μ-law chunks: 0xFF is silence, 0x00 full scale. Each loud chunk is
// numbered so a test can see which ones played.
const quiet = btoa('\xff'.repeat(800));
const loud = (n: number) => btoa(String.fromCharCode(n) + '\x00'.repeat(799));

/** Feeds a caller turn as GPT-Live sends it: words (`"text"`), silence (`_`) and numbered sound (`#n`), 100ms a chunk. */
function run(gate: FillerGate, steps: (string | number)[]) {
  const line = { played: [] as (number | '_')[], words: '', dropped: '' };
  const take = (out: GateOut) => {
    for (const p of out.play) line.played.push(p === quiet ? '_' : atob(p).charCodeAt(0));
    line.words += out.words;
    line.dropped += out.dropped;
  };
  for (const step of steps) {
    if (step === '_') take(gate.audio(quiet, false));
    else if (typeof step === 'number') take(gate.audio(loud(step), true));
    else line.words += gate.hear(step);
  }
  return { ...line, sounds: line.played.filter((p) => p !== '_') };
}

test('a filler is judged on its whole stretch, speech on its first real word', () => {
  assert.equal(judge('Mm-h', false), 'undecided', 'may still become "mm-hmm"');
  assert.equal(judge('Mm-hmm.', false), 'undecided', 'more may follow in the same breath');
  assert.equal(judge('Mm-hmm.', true), 'filler');
  assert.equal(judge(' Hmm. Okay.', true), 'filler');
  assert.equal(judge('[bre', false), 'undecided');
  assert.equal(judge('[breath] [lip smack]', true), 'filler');
  assert.equal(judge('.', true), 'filler', "Kate's call: a sound transcribed as a lone period");
  assert.equal(judge('', true), 'speech', 'sound with no words yet plays');
  assert.equal(judge('Schedule', false), 'speech');
  assert.equal(judge('Okay. Schedule', false), 'speech');
  assert.equal(judge('A', false), 'undecided', 'may be "ah"');
  assert.equal(judge('A ', false), 'speech');
  assert.equal(judge('No.', false), 'speech');
  for (const answer of ['Yeah.', 'Sure.', 'Yes.', '2.']) assert.equal(judge(answer, true), 'speech', `${answer} answers a question`);
});

test('"Okay." before its answer stays off the line, and the answer plays: Kate\'s GE call', () => {
  // call_ldb8bzvlopko2yzl: "Okay. Schedule a repair." got "Sorry, I didn't get that."
  const line = run(new FillerGate(), [' Okay.', '_', '_', 1, 2, 3, '_', ' Schedule', '_', '_', '_', 4, ' a repair', 5, '.', 6, 7, '_', '_']);
  assert.deepEqual(line.sounds, [4, 5, 6, 7]);
  assert.equal(line.words, ' Schedule a repair.');
  assert.equal(line.dropped, ' Okay.');
});

test('"Mm-hmm" over a recording never reaches it, and the answer after it plays the moment it starts', () => {
  // GPT-Live as traced on GE's greeting: « Mm-h» _200 «mm.» #200 _1100 « Schedule» _300 #100 « a repair» ...
  const gate = new FillerGate();
  const before = run(gate, [' Mm-h', '_', '_', 'mm.', 1, 2, ...Array(11).fill('_'), ' Schedule', '_', '_', '_']);
  assert.deepEqual(before.sounds, []);
  assert.equal(before.dropped, ' Mm-hmm.');
  assert.equal(before.words, ' Schedule', 'on the transcript as soon as it came, as without the gate');
  assert.deepEqual(run(gate, [3]).sounds, [3], 'not held: its first word came ahead of it');
});

test('a filler in the same breath as the answer plays with it, as recognizers take it', () => {
  const line = run(new FillerGate(), [' Okay,', '_', 1, ' schedule', 2, 3, ' a repair.', 4, '_', '_']);
  assert.deepEqual(line.sounds, [1, 2, 3, 4]);
  assert.equal(line.words, ' Okay, schedule a repair.');
  assert.equal(line.dropped, '');
});

test('a breath transcribed with no sound is dropped from the transcript once nothing follows it', () => {
  const gate = new FillerGate();
  const line = run(gate, [' [bre', '_', 'ath]', ...Array(16).fill('_')]);
  assert.equal(line.dropped, ' [breath]');
  assert.equal(line.words, '');
  assert.equal(line.played.length, 17, 'silence still streams');
  assert.deepEqual(run(gate, [' Dishwasher.', '_', 1, 2, '_', '_']).sounds, [1, 2]);
});

test('sound with no words ahead of it plays at once, and a long filler plays without waiting for its end', () => {
  // GPT-Live's words lead its sound: sound without them is a noise the transcript missed, or words running late.
  const late = run(new FillerGate(), [1, ' Schedule', 2, '_', '_']);
  assert.deepEqual(late.sounds, [1, 2]);
  assert.equal(late.words, ' Schedule');
  const gate = new FillerGate();
  assert.deepEqual(run(gate, [' Mmmmm', ...Array.from({ length: 14 }, (_, i) => i + 1)]).sounds, []);
  assert.deepEqual(run(gate, [15]).sounds, Array.from({ length: 15 }, (_, i) => i + 1), 'released at 1.5s');
  assert.deepEqual(run(gate, [16]).sounds, [16]);
});

test('a stretch that pauses mid-sentence keeps its words, and speech after a played answer is judged again', () => {
  const gate = new FillerGate();
  const line = run(gate, [' Schedule', 1, '_', ' a repair.', 2, 3, '_', '_', ' Hmm.', '_', 4, '_', '_']);
  assert.deepEqual(line.sounds, [1, 2, 3]);
  assert.equal(line.words, ' Schedule a repair.');
  assert.equal(line.dropped, ' Hmm.');
});

test('a real word in a filler\'s pause plays the rest of that stretch, held part and all', () => {
  const line = run(new FillerGate(), [' Hmm', 1, '_', ' no.', 2, '_', '_']);
  assert.deepEqual(line.sounds, [1, 2]);
  assert.equal(line.words, ' Hmm no.');
});

test('words with no sound go on the transcript at once when they are speech', () => {
  // A voicemail message transcribed before its audio: the voicemail check reads the transcript.
  const line = run(new FillerGate(), [" Hi, this is Alex Kim's assistant.", '_', '_']);
  assert.equal(line.words, " Hi, this is Alex Kim's assistant.");
});

test('flush plays what was held; reset drops it', () => {
  const held = new FillerGate();
  run(held, [' Hmm', 1]);
  const out = held.flush();
  assert.equal(out.play.length, 1);
  assert.equal(out.words, ' Hmm');
  const dropped = new FillerGate();
  run(dropped, [' Hmm', 1, ' Schedule']);
  dropped.reset();
  assert.deepEqual(dropped.flush(), { play: [], words: '', dropped: '' });
});
