import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { downloadRecording, silenceChecks } from '../scripts/review-call-audio';

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

