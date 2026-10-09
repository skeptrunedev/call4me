#!/usr/bin/env -S node --import tsx
/** Private acquisition and review tooling. Never publishes or guesses redactions. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cliD1 } from './d1-cli';
import { telnyx } from '../src/server/lib/telnyx';

const repository = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
export function privatePath(file: string): string {
  const path = resolve(file);
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const canonical = resolve(realpathSync(ancestor), relative(ancestor, path));
  const rel = relative(repository, canonical);
  assert.ok(rel && (rel.startsWith('..' + '/') || isAbsolute(rel)), 'private evidence must be outside the repository');
  return path;
}
function save(file: string, value: unknown) {
  privatePath(file);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
}
export type Mute = { start: number; end: number; label: string };
export type Manifest = { source: string; sourceSha256: string; reviewed: true; mutes: Mute[] };
export function validateMutes(mutes: Mute[], duration: number) {
  assert.ok(Array.isArray(mutes), 'mutes must be an array');
  let previousEnd = 0;
  for (const mute of mutes) {
    assert.ok(Number.isFinite(mute.start) && Number.isFinite(mute.end) && mute.start >= previousEnd && mute.end > mute.start && mute.end <= duration + 0.001, 'mute spans must be ordered, nonoverlapping and within the source');
    assert.ok(typeof mute.label === 'string' && mute.label.trim(), 'every manual mute needs a reason');
    previousEnd = mute.end;
  }
}
export function muteFilter(mutes: Mute[]) {
  return mutes.length ? `aeval=exprs='val(0)*(${mutes.map(m => `not(between(t,${m.start},${m.end}))`).join('*')})'` : 'anull';
}
/** gpt-4o-transcribe rejects audio over 1400 s; split longer files into equal windows under that limit. */
export function asrWindows(duration: number, limit = 1400) {
  const count = Math.max(1, Math.ceil(duration / (limit - 60)));
  return Array.from({ length: count }, (_, index) => ({ start: (duration * index) / count, end: (duration * (index + 1)) / count }));
}
function ffmpeg(binary: string, args: string[]) {
  return execFileSync(binary, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { maxBuffer: 512 * 1024 * 1024 });
}
function decode(file: string, binary: string) {
  const bytes = ffmpeg(binary, ['-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1']);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
export async function downloadRecording(url: string, progress: (downloaded: number, total: number) => void = () => {}) {
  // S3 can deliver historical recordings slowly on one connection. Independent
  // ranges preserve exact bytes and bound each request without abandoning an
  // entire large source on a single stream timeout.
  const probe = await fetch(url, { headers: { Range: 'bytes=0-0', 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(120_000) });
  assert.equal(probe.status, 206, 'recording server must support byte ranges');
  const match = /^bytes 0-0\/(\d+)$/.exec(probe.headers.get('content-range') ?? '');
  assert.ok(match, 'invalid recording byte range');
  const total = Number(match[1]);
  const etag = probe.headers.get('etag');
  assert.ok(Number.isSafeInteger(total) && total > 0 && total < 512 * 1024 * 1024 && etag, 'recording must have a bounded size and stable ETag');
  assert.equal((await probe.arrayBuffer()).byteLength, 1, 'invalid recording probe length');
  const size = 1024 * 1024;
  const count = Math.ceil(total / size);
  const chunks: Buffer[] = new Array(count);
  let next = 0;
  let downloaded = 0;
  progress(downloaded, total);
  const workers = await Promise.allSettled(Array.from({ length: Math.min(4, count) }, async () => {
    while (next < count) {
      const index = next++;
      const start = index * size;
      const end = Math.min(total - 1, start + size - 1);
      const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, 'If-Match': etag, 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(180_000) });
      assert.equal(response.status, 206, 'recording range download failed');
      assert.equal(response.headers.get('etag'), etag, 'recording changed during download');
      assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${total}`, 'recording range mismatch');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, end - start + 1, 'recording range truncated');
      chunks[index] = bytes;
      downloaded += bytes.length;
      progress(downloaded, total);
    }
  }));
  for (const result of workers) { if (result.status === 'rejected') throw result.reason; }
  return Buffer.concat(chunks);
}
async function fetchCall(callId: string, out: string) {
  privatePath(out);
  assert.ok(process.env.TELNYX_API_KEY, 'TELNYX_API_KEY required');
  const db = cliD1();
  const row = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(callId).first<{ id: string; status: string; telnyx_call_control_id: string }>();
  assert.ok(row && row.telnyx_call_control_id, 'call missing or has no provider control ID');
  assert.ok(['completed', 'failed', 'canceled', 'cancelled', 'no_answer', 'busy'].includes(row.status), 'call must have finished');
  const controlId = row.telnyx_call_control_id;
  const provider = telnyx({ TELNYX_API_KEY: process.env.TELNYX_API_KEY, TELNYX_CONNECTION_ID: process.env.TELNYX_CONNECTION_ID ?? '' });
  const saved = await db.prepare('SELECT call_leg_id FROM call_provider_legs WHERE call_control_id = ?').bind(controlId).first<{ call_leg_id: string }>();
  console.log(JSON.stringify({ callId, phase: saved ? 'saved provider leg' : 'recovering historical provider leg' }));
  const legId = saved?.call_leg_id ?? await provider.callLeg(controlId);
  assert.ok(legId, 'exact provider leg association is required');
  const allRecords = await provider.recordings(controlId, legId);
  const controlRecords = allRecords.length ? undefined : await provider.recordings(controlId);
  save(join(out, 'association.private.json'), { call: row, callControlId: controlId, callLegId: legId, recordings: allRecords, controlRecordings: controlRecords });
  const records = allRecords.filter(r => r.status === 'completed' && r.download_urls?.wav);
  assert.ok(records.length, 'no completed WAV recording found for the exact provider leg; inspect private association evidence');
  assert.equal(records.length, 1, 'expected exactly one completed WAV; ambiguous calls require review');
  const record = records[0];
  console.log(JSON.stringify({ callId, phase: 'downloading exact WAV', recordingId: record.id, durationMillis: record.duration_millis }));
  const bytes = await downloadRecording(record.download_urls!.wav!, (downloadedBytes, totalBytes) => console.log(JSON.stringify({ callId, phase: 'download progress', downloadedBytes, totalBytes })));
  assert.ok(bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE', 'provider response is not WAV');
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const file = join(out, 'source.wav');
  assert.ok(!existsSync(file) || hash(file) === createHash('sha256').update(bytes).digest('hex'), 'existing source differs');
  writeFileSync(file, bytes, { mode: 0o600 });
  chmodSync(file, 0o600);
  save(join(out, 'source.private.json'), { call: row, callControlId: controlId, callLegId: legId, recording: record, sourceSha256: hash(file), fetchedAt: new Date().toISOString() });
  console.log(JSON.stringify({ callId, file, sourceSha256: hash(file) }));
}
async function transcribe(file: string, out: string, binary = 'ffmpeg') {
  privatePath(out);
  assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY required');
  const inputSha256 = hash(file);
  let uploadFile = file;
  if (readFileSync(file).length > 24_000_000) {
    mkdirSync(out, { recursive: true, mode: 0o700 });
    uploadFile = join(out, 'asr-input.private.mp3');
    ffmpeg(binary, ['-y', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '24000', '-b:a', '64k', '-map_metadata', '-1', uploadFile]);
    chmodSync(uploadFile, 0o600);
    assert.ok(readFileSync(uploadFile).length < 24_000_000, 'full duration ASR input remains too large');
  }
  const duration = decode(file, binary).length / 16000;
  const request = async (model: string, upload: string) => {
    const form = new FormData();
    form.set('file', new Blob([readFileSync(upload)]), upload.endsWith('.mp3') ? 'audio.mp3' : 'audio.wav');
    form.set('model', model);
    if (model === 'whisper-1') {
      form.set('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      form.append('timestamp_granularities[]', 'segment');
    }
    // Intentionally unprompted: no language, private facts or expected transcript.
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(300_000) });
    assert.ok(response.ok, `ASR ${model} failed: ${response.status}`);
    const result = await response.json() as { text?: string };
    assert.equal(typeof result.text, 'string', 'ASR returned no text');
    return result as { text: string };
  };
  const results = await Promise.allSettled(['whisper-1', 'gpt-4o-transcribe'].map(async model => {
    const destination = join(out, `${model}.private.json`);
    if (existsSync(destination)) {
      const cached = JSON.parse(readFileSync(destination, 'utf8'));
      if (cached.inputSha256 === inputSha256 && typeof cached.result?.text === 'string') return destination;
    }
    // whisper-1 is bounded by upload size and keeps full-file word timestamps;
    // gpt-4o-transcribe rejects long audio, so it reads consecutive windows.
    const windows = model === 'gpt-4o-transcribe' ? asrWindows(duration) : [{ start: 0, end: duration }];
    let result: { text: string; windows?: { start: number; end: number; text: string }[] };
    if (windows.length === 1) result = await request(model, uploadFile);
    else {
      mkdirSync(out, { recursive: true, mode: 0o700 });
      const parts = [];
      for (const [index, window] of windows.entries()) {
        const piece = join(out, `${model}-window-${index}.private.mp3`);
        ffmpeg(binary, ['-y', '-ss', String(window.start), '-t', String(window.end - window.start), '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '24000', '-b:a', '64k', '-map_metadata', '-1', piece]);
        chmodSync(piece, 0o600);
        parts.push({ ...window, text: (await request(model, piece)).text });
      }
      result = { text: parts.map(part => part.text).join(' '), windows: parts };
    }
    save(destination, { inputSha256, uploadedSha256: hash(uploadFile), model, createdAt: new Date().toISOString(), result });
    return destination;
  }));
  for (const result of results) { if (result.status === 'rejected') throw result.reason; }
  console.log(JSON.stringify({ file, out, models: ['whisper-1', 'gpt-4o-transcribe'] }));
}
function loadManifest(file: string, binary: string) {
  privatePath(file);
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  assert.equal(manifest.reviewed, true, 'manifest requires explicit manual review');
  manifest.source = resolve(dirname(file), manifest.source);
  privatePath(manifest.source);
  assert.equal(hash(manifest.source), manifest.sourceSha256, 'source hash does not match reviewed manifest');
  const duration = decode(manifest.source, binary).length / 16000;
  validateMutes(manifest.mutes, duration);
  return { manifest, duration };
}
function exportAudio(manifestFile: string, out: string, binary: string) {
  const { manifest } = loadManifest(manifestFile, binary);
  assert.ok(out.endsWith('.mp3'), 'export must use .mp3');
  assert.notEqual(resolve(out), manifest.source, 'cannot overwrite source');
  mkdirSync(dirname(resolve(out)), { recursive: true });
  // Mono first, sample accurate muting, normal speed and complete timing. Mute
  // again after normalization/resampling to prevent filters smearing private audio.
  const mute = muteFilter(manifest.mutes);
  ffmpeg(binary, ['-y', '-i', manifest.source, '-map', '0:a:0', '-vn', '-af', `aformat=channel_layouts=mono,${mute},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000,${mute}`, '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', '-id3v2_version', '0', out]);
  console.log(JSON.stringify({ file: out, sha256: hash(out) }));
}
export function silenceChecks(samples: Float32Array, mutes: Mute[]) {
  return mutes.map(mute => {
    // MP3 uses overlapping transform windows; inspect the interior beyond its
    // boundary ringing, while preserving the requested sample exact source mute.
    const margin = Math.min(0.1, (mute.end - mute.start) / 4);
    const start = Math.ceil((mute.start + margin) * 16000);
    const end = Math.floor((mute.end - margin) * 16000);
    assert.ok(end > start && end <= samples.length, 'mute has no verifiable decoded interior');
    let sum = 0;
    let peak = 0;
    for (let i = start; i < end; i++) { sum += samples[i] ** 2; peak = Math.max(peak, Math.abs(samples[i])); }
    const rms = Math.sqrt(sum / (end - start));
    assert.ok(rms <= 0.0001 && peak <= 0.001, `mute ${mute.start} to ${mute.end} contains decoded audio`);
    return { ...mute, checkedStart: start / 16000, checkedEnd: end / 16000, rms, peak };
  });
}
async function verify(manifestFile: string, file: string, out: string, binary: string) {
  privatePath(out);
  const { manifest, duration } = loadManifest(manifestFile, binary);
  const samples = decode(file, binary);
  const exportedDuration = samples.length / 16000;
  assert.ok(Math.abs(duration - exportedDuration) < 0.05, `duration changed: ${duration} vs ${exportedDuration}`);
  const mutes = silenceChecks(samples, manifest.mutes);
  await transcribe(file, join(out, 'asr'), binary);
  save(join(out, 'verification.private.json'), { sourceSha256: manifest.sourceSha256, exportSha256: hash(file), sourceDuration: duration, exportedDuration, mutes, verifiedAt: new Date().toISOString(), note: 'ASR requires manual comparison; this report does not establish privacy review or human listening.' });
  console.log(JSON.stringify({ file, duration: exportedDuration, verifiedMutes: mutes.length, out }));
}
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'call-id': { type: 'string' }, file: { type: 'string' }, out: { type: 'string' }, manifest: { type: 'string' }, ffmpeg: { type: 'string', default: 'ffmpeg' } } });
  assert.ok(values.out, '--out required');
  const command = positionals[0];
  if (command === 'fetch') { assert.ok(values['call-id'], '--call-id required'); await fetchCall(values['call-id'], resolve(values.out)); }
  else if (command === 'transcribe') { assert.ok(values.file, '--file required'); await transcribe(resolve(values.file), resolve(values.out), values.ffmpeg!); }
  else if (command === 'export') { assert.ok(values.manifest, '--manifest required'); exportAudio(resolve(values.manifest), resolve(values.out), values.ffmpeg!); }
  else if (command === 'verify') { assert.ok(values.manifest && values.file, '--manifest and --file required'); await verify(resolve(values.manifest), resolve(values.file), resolve(values.out), values.ffmpeg!); }
  else throw new Error('commands: fetch, transcribe, export, verify');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error instanceof Error ? error.message : 'audio review failed'); process.exitCode = 1; });
