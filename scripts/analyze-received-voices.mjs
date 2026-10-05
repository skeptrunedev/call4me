#!/usr/bin/env node
/** Analyze completed received voice trials without publishing them.
 * node --env-file=.dev.vars scripts/analyze-received-voices.mjs \
 *   --out /private/evidence --ffmpeg /path/to/ffmpeg
 * Saves two unprompted ASR transcripts for each readback, an independent
 * transcript of every full export, and a sanitized review manifest. Existing
 * successful ASR results are reused so analysis can run as calls finish.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { hasSpeech } from './received-audio.mjs';
import { scoreReceivedReadback } from './received-transcription.mjs';

const { values } = parseArgs({ options: { out: { type: 'string' }, ffmpeg: { type: 'string' } } });
assert.ok(values.out && values.ffmpeg && process.env.OPENAI_API_KEY, 'out, ffmpeg and OPENAI_API_KEY required');
const out = resolve(values.out);
const repository = resolve(import.meta.dirname, '..');
assert.ok(out !== repository && !out.startsWith(repository + '/'), 'evidence must stay outside this repository');
const save = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2), { mode: 0o600 });
const ffmpeg = (...args) => execFileSync(values.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
async function transcribe(file, model, name) {
  if (existsSync(join(out, name))) return JSON.parse(readFileSync(join(out, name), 'utf8'));
  const form = new FormData();
  form.set('file', new Blob([readFileSync(file)]), file.endsWith('.wav') ? 'audio.wav' : 'audio.mp3');
  form.set('model', model);
  if (model === 'whisper-1') {
    form.set('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
  }
  // No language, expected facts or reference code are supplied to ASR.
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: form, signal: AbortSignal.timeout(120_000),
  });
  assert.ok(response.ok, `ASR ${model} failed: ${response.status}`);
  const result = await response.json();
  assert.equal(typeof result.text, 'string', 'missing ASR text');
  save(name, result);
  return result;
}

const manifest = [];
const files = readdirSync(out).filter(f => /^t\d+-(marin|cedar|gleam|meridian)\.private\.json$/.test(f));
files.sort((a, b) => Number(a.match(/^t(\d+)/)[1]) - Number(b.match(/^t(\d+)/)[1]));
for (const file of files) {
  const t = JSON.parse(readFileSync(join(out, file), 'utf8'));
  assert.ok(!t.error && t.phases.length === 3 && t.receivedDurationSeconds > 0, `incomplete ${file}`);
  const stem = `${t.id}-${t.voice}`;
  const wav = join(out, stem + '.wav');
  const mp3 = join(out, `received-${stem}.mp3`);
  ffmpeg('-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '1', '-ar', '22050', '-b:a', '96k', '-map_metadata', '-1', mp3);
  const exported = await transcribe(mp3, 'whisper-1', stem + '-export-asr.private.json');
  const source = await transcribe(wav, 'gpt-4o-transcribe', stem + '-source-asr.private.json');
  const packets = readFileSync(join(out, stem + '-received.private.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const boundary = phase => Number(packets[t.phases[phase].receivedFrames]?.timestamp) / 8000;
  const readbacks = [];
  for (let phase = 0; phase < 2; phase++) {
    // Boundaries use the actual carrier frame clock at prompt start. Preserve
    // full caller audio, including silence; the receiver prompt is another track.
    const start = boundary(phase);
    const end = boundary(phase + 1);
    assert.ok(Number.isFinite(start) && Number.isFinite(end) && end > start, 'invalid carrier phase boundary');
    const clip = join(out, `${stem}-readback-${phase}.wav`);
    ffmpeg('-i', wav, '-ss', String(start), '-t', String(end - start), '-ar', '8000', '-ac', '1', clip);
    const results = await Promise.allSettled(['whisper-1', 'gpt-4o-transcribe'].map(model => transcribe(clip, model, `${stem}-readback-${phase}-${model}.private.json`)));
    const transcripts = results.map((r, i) => { if (r.status === 'rejected') throw r.reason; return {
      model: ['whisper-1', 'gpt-4o-transcribe'][i], text: r.value.text,
      recognized: scoreReceivedReadback(r.value.text, phase === 0 ? 'initial' : 'corrected'),
    }; });
    const firstSpeech = packets.find(packet => Number(packet.timestamp) / 8000 >= start && Number(packet.timestamp) / 8000 < end && hasSpeech(Buffer.from(packet.payload, 'base64')));
    readbacks.push({ phase: phase === 0 ? 'initial' : 'corrected', start, end,
      inputSha256: createHash('sha256').update(readFileSync(clip)).digest('hex'),
      speechStart: firstSpeech ? Number(firstSpeech.timestamp) / 8000 : null, transcripts });
  }
  const row = { id: t.id, voice: t.voice, round: t.round, startedAt: t.startedAt,
    duration: t.receivedDurationSeconds, leadingMillis: t.leadingMillis, missingMillis: t.missingMillis,
    duplicateBytes: t.duplicateBytes, sha256: createHash('sha256').update(readFileSync(mp3)).digest('hex'),
    modelOutputText: t.modelTranscript.filter(event => event.type === 'session.output_transcript.delta').map(event => event.delta).join('').trim(),
    sourceText: source.text, exportText: exported.text, readbacks };
  manifest.push(row);
  save('review-manifest.json', manifest);
  console.log(JSON.stringify(row));
}
