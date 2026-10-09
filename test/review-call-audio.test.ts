import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { asrWindows, downloadRecording, muteFilter, privatePath, silenceChecks, validateMutes } from '../scripts/review-call-audio';

test('ranged acquisition preserves exact bytes and rejects changed provider objects', async t => {
  const source = Buffer.alloc(3 * 1024 * 1024 + 37);
  for (let i = 0; i < source.length; i++) source[i] = i % 251;
  let changed = false;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const match = /^bytes=(\d+)-(\d+)$/.exec(headers.Range)!;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (end > 0) assert.equal(headers['If-Match'], '"source-etag"');
    return new Response(source.subarray(start, end + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${source.length}`, etag: changed && end > 0 ? '"changed"' : '"source-etag"' } });
  });
  assert.deepEqual(await downloadRecording('https://example.invalid/private.wav'), source);
  changed = true;
  await assert.rejects(downloadRecording('https://example.invalid/private.wav'), /changed during download/);
});

test('private evidence paths cannot point into the repository', () => {
  assert.throws(() => privatePath(resolve('public/static/raw.wav')), /outside/);
  assert.throws(() => privatePath(resolve('.')), /outside/);
  assert.equal(privatePath(join(tmpdir(), 'call-review-test', 'source.wav')), join(tmpdir(), 'call-review-test', 'source.wav'));
});

test('manual intervals reject overlap, nonfinite values and out of bounds', () => {
  const valid = { start: 1, end: 2, label: 'name' };
  validateMutes([valid], 3);
  for (const spans of [[{ ...valid, start: NaN }], [valid, { ...valid, start: 1.5 }], [{ ...valid, end: 4 }], [{ ...valid, label: '' }]]) assert.throws(() => validateMutes(spans, 3));
  assert.match(muteFilter([valid]), /between\(t,1,2\)/);
});

test('decoded silence checks fail on audible private spans', () => {
  const samples = new Float32Array(48000);
  const spans = [{ start: 1, end: 2, label: 'name' }];
  assert.equal(silenceChecks(samples, spans)[0].peak, 0);
  samples[24000] = 0.1;
  assert.throws(() => silenceChecks(samples, spans), /contains decoded audio/);
});

const binary = process.env.FFMPEG ?? 'ffmpeg';
const hasFfmpeg = (() => {
  try { execFileSync(binary, ['-version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
})();
test('real MP3 export preserves full duration, mutes interior and retains surrounding sound', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'call-audio-test-'));
  const source = join(dir, 'source.wav');
  execFileSync(binary, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ar', '16000', source]);
  const manifest = join(dir, 'manifest.private.json');
  const mutes = [{ start: 1, end: 2, label: 'synthetic sensitive tone' }];
  writeFileSync(manifest, JSON.stringify({ source, sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'), reviewed: true, mutes }));
  const out = join(dir, 'export.mp3');
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/review-call-audio.ts', 'export', '--manifest', manifest, '--out', out, '--ffmpeg', binary]);
  const bytes = execFileSync(binary, ['-hide_banner', '-loglevel', 'error', '-i', out, '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1']);
  const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.ok(Math.abs(samples.length / 16000 - 3) < 0.05);
  silenceChecks(samples, mutes);
  assert.ok(samples.slice(1600, 8000).some(sample => Math.abs(sample) > 0.01));
  assert.ok(samples.slice(35000, 45000).some(sample => Math.abs(sample) > 0.01));
  writeFileSync(manifest, JSON.stringify({ source, sourceSha256: 'incorrect source hash', reviewed: true, mutes }));
  assert.throws(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/review-call-audio.ts', 'export', '--manifest', manifest, '--out', out, '--ffmpeg', binary], { stdio: 'pipe' }), /source hash does not match/);
});

test('long recordings split into contiguous gpt-4o-transcribe windows under its 1400 second limit', () => {
  assert.deepEqual(asrWindows(663), [{ start: 0, end: 663 }]);
  const windows = asrWindows(1591.32);
  assert.equal(windows.length, 2);
  assert.equal(windows[0].start, 0);
  assert.equal(windows.at(-1)!.end, 1591.32);
  for (const [index, window] of windows.entries()) {
    assert.ok(window.end - window.start < 1400);
    if (index) assert.equal(window.start, windows[index - 1].end);
  }
  assert.equal(asrWindows(5000).length, 4);
});
