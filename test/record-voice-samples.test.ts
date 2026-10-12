import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../scripts/record-voice-samples.mjs', import.meta.url), 'utf8')
  .replace(/^#!.*\n/, '').replace(/^import .*;\n/gm, '').replaceAll('import.meta.dirname', 'scriptDir');

async function trial({ mismatch = false, custom = true, extra = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'voice-recorder-test-'));
  const out = join(dir, 'private');
  const instructions = '  Exact experiment instructions.\n';
  writeFileSync(join(dir, 'instructions.txt'), instructions);
  let sent;
  let calls = 0;
  class Socket {
    handlers = {};
    addEventListener(type, handler) {
      this.handlers[type] = handler;
      if (type === 'open') queueMicrotask(handler);
    }
    send(raw) {
      const event = JSON.parse(raw);
      if (event.type !== 'session.start') return;
      sent = event;
      queueMicrotask(() => {
        const deliver = (data) => this.handlers.message({ data: JSON.stringify(data) });
        deliver({ type: 'session.started', secret: 'excluded', session: {
          id: 'test-session', model: 'gpt-live-1', secret: 'excluded',
          audio: { format: { type: 'audio/pcmu', rate: 8000 }, output: { voice: mismatch ? 'marin' : 'willow' } },
        } });
        deliver({ type: 'session.output_audio.delta', delta: Buffer.from([1, 2, 3]).toString('base64') });
        deliver({ type: 'session.output_transcript.delta', delta: 'Hello.' });
      });
    }
    close() {}
  }
  let error;
  try {
    await runInNewContext(`(async () => { ${source}\n })()`, {
      scriptDir: join(dir, 'scripts'), Buffer, WebSocket: Socket,
      process: { env: { OPENAI_API_KEY: 'test-only' }, argv: ['node', 'recorder',
        ...(custom ? ['--out', out] : []), '--instructions', join(dir, 'instructions.txt'), ...extra, 'willow'] },
      console: { log() {}, error() {} },
      Date: class extends Date { static now() { return Date.now() + (++calls * 3000); } },
      setTimeout, clearTimeout, setInterval, clearInterval,
      readFileSync, writeFileSync, mkdirSync, mkdtempSync, tmpdir, join,
      fetch: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([4, 5]).buffer }),
      execFileSync: (_cmd, args) => writeFileSync(args.at(-1), Buffer.from([9])),
    });
  } catch (err) { error = err; }
  return { dir, out, instructions, sent, error };
}

test('private recording retains exact instructions, raw audio, transcript and sanitized accepted configuration', async () => {
  const result = await trial();
  try {
    assert.equal(result.error, undefined);
    assert.equal(result.sent.session.instructions, result.instructions);
    const manifest = JSON.parse(readFileSync(join(result.out, 'willow.json'), 'utf8'));
    assert.equal(manifest.requestedSession.instructions, result.instructions);
    assert.equal(manifest.transcript, 'Hello.');
    assert.equal(manifest.verification.voice, 'matched');
    assert.equal(JSON.stringify(manifest).includes('excluded'), false);
    assert.deepEqual(readFileSync(join(result.out, 'willow.ulaw')), Buffer.from([1, 2, 3]));
    assert.ok(existsSync(join(result.out, 'willow.mp3')));
  } finally { rmSync(result.dir, { recursive: true }); }
});

test('explicit voice mismatch fails and retains diagnostic manifest without publishing MP3', async () => {
  const result = await trial({ mismatch: true });
  try {
    assert.match(result.error.message, /resolved session differs/);
    const manifest = JSON.parse(readFileSync(join(result.out, 'willow.json'), 'utf8'));
    assert.equal(manifest.verification.voice, 'mismatch');
    assert.equal(existsSync(join(result.out, 'willow.mp3')), false);
  } finally { rmSync(result.dir, { recursive: true }); }
});

test('default recording still writes only MP3 in the public voices directory', async () => {
  const result = await trial({ custom: false });
  try {
    assert.equal(result.error, undefined);
    const stem = join(result.dir, 'public/static/voices/willow');
    assert.ok(existsSync(`${stem}.mp3`));
    assert.equal(existsSync(`${stem}.json`), false);
    assert.equal(existsSync(`${stem}.ulaw`), false);
  } finally { rmSync(result.dir, { recursive: true }); }
});
