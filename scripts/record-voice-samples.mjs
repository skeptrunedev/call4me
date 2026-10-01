#!/usr/bin/env node
/**
 * Record the /voices page samples: one GPT-Live session per voice, at the phone format real
 * calls use (8 kHz μ-law), so each sample sounds the way a business hears the caller.
 *
 *   OPENAI_API_KEY=... npm run voices:record [-- marin cedar]
 *
 * A TTS "thanks for calling" plays in as the business answering; the caller's reply is kept,
 * loudness-normalized like the example recordings (docs/examples.md), and written to
 * public/static/voices/<voice>.mp3. Prints each spoken transcript for src/content/voices.ts.
 * Needs ffmpeg on PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VOICES = ['marin', 'cedar', 'gleam', 'meridian'];
const LIVE_URL = 'wss://api.openai.com/v1/live/sessions';
const GREETING = 'Hi, thanks for calling Rosa\'s Kitchen, how can I help you?';
const LINE = "Hi! This is Alex's assistant. I was hoping to get a table for four tonight, around seven. Do you have anything open?";
const INSTRUCTIONS = `You're on a live phone call, calling a restaurant for Alex as Alex's assistant. When they answer, say exactly this, warmly and naturally, then stop and wait: "${LINE}"`;
/**
 * How long after the caller's last spoken word the sample is done. GPT-Live streams audio frames
 * the whole session, silence included, so the transcript (not the audio) says when it stopped.
 */
const DONE_AFTER_MS = 2500;

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY is required');
  process.exit(1);
}
const voices = process.argv.slice(2).length ? process.argv.slice(2) : VOICES;
const unknown = voices.filter((v) => !VOICES.includes(v));
if (unknown.length) {
  console.error(`unknown voice: ${unknown.join(', ')} (one of ${VOICES.join(', ')})`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'voice-samples-'));
const outDir = join(import.meta.dirname, '..', 'public', 'static', 'voices');
mkdirSync(outDir, { recursive: true });
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

/** The business picking up, as 8 kHz μ-law, the same as the phone side of a real call. */
async function greeting() {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'ash', input: GREETING, response_format: 'wav' }),
  });
  if (!res.ok) throw new Error(`greeting TTS failed: ${res.status} ${await res.text()}`);
  const wav = join(work, 'greeting.wav');
  writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
  const ulaw = join(work, 'greeting.ulaw');
  ffmpeg('-i', wav, '-ar', '8000', '-ac', '1', '-f', 'mulaw', ulaw);
  return readFileSync(ulaw);
}

function record(voice, phone) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(LIVE_URL, { headers: { authorization: `Bearer ${key}` } });
    const audio = [];
    let transcript = '';
    let lastWordAt = 0;
    let feeder;
    const timeout = setTimeout(() => finish(new Error(`${voice}: no finished sample after 30s`)), 30_000);
    const quiet = setInterval(() => {
      if (lastWordAt && Date.now() - lastWordAt > DONE_AFTER_MS) finish();
    }, 100);
    function finish(err) {
      clearTimeout(timeout);
      clearInterval(quiet);
      clearInterval(feeder);
      ws.close();
      if (err) reject(err);
      else resolve({ audio: Buffer.concat(audio), transcript: transcript.trim() });
    }
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'session.start',
        session: { model: 'gpt-live-1', instructions: INSTRUCTIONS, audio: { format: { type: 'audio/pcmu', rate: 8000 }, output: { voice } } },
      }));
    });
    ws.addEventListener('error', () => finish(new Error(`${voice}: live socket error`)));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === 'session.started') {
        // The greeting, then silence, in 20 ms frames at real time, as Telnyx streams a call.
        const frames = [];
        for (let i = 0; i < phone.length; i += 160) frames.push(phone.subarray(i, i + 160));
        const silence = Buffer.alloc(160, 0xff);
        feeder = setInterval(() => {
          ws.send(JSON.stringify({ type: 'session.input_audio.append', audio: (frames.shift() ?? silence).toString('base64') }));
        }, 20);
      } else if (msg.type === 'session.output_audio.delta') {
        audio.push(Buffer.from(msg.delta, 'base64'));
      } else if (msg.type === 'session.output_transcript.delta') {
        transcript += msg.delta;
        lastWordAt = Date.now();
      } else if (msg.type === 'error') {
        finish(new Error(`${voice}: ${JSON.stringify(msg.error ?? msg)}`));
      }
    });
  });
}

const phone = await greeting();
for (const voice of voices) {
  const { audio, transcript } = await record(voice, phone);
  const raw = join(work, `${voice}.ulaw`);
  writeFileSync(raw, audio);
  const out = join(outDir, `${voice}.mp3`);
  ffmpeg('-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm', '-ac', '1', '-ar', '22050', '-b:a', '96k', out);
  console.log(`${voice} -> ${out}\n  "${transcript}"`);
}
