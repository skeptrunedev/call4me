#!/usr/bin/env node
/**
 * Opt in carrier evaluation. Creates an isolated Telnyx SIP application, then
 * makes paid test calls to it. Never changes a phone number's routing.
 *
 * node --env-file=.dev.vars --import tsx scripts/eval-received-voices.mjs \
 *   --out /private/evidence --cloudflared /path/to/cloudflared \
 *   --ffmpeg /path/to/ffmpeg --from +YOUR_OWNED_NUMBER [--trials 3] [--voices marin]
 *   [--application INACTIVE_TEST_APP_ID] [--dns-server 1.1.1.1]
 *
 * The receiver plays fixed synthetic prompts and captures the received PCMU
 * stream. This is a carrier SIP experiment, not a PSTN or handset experiment.
 * Raw evidence must be outside this repository. Reuse accepts only an inactive
 * application created by this fixture. The optional resolver affects only the
 * tunnel health check and retains HTTPS hostname verification.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { get as httpsGet } from 'node:https';
import { Resolver } from 'node:dns/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyTelnyxSignature } from '../src/server/lib/telnyx.ts';
import { assembleReceivedAudio, hasSpeech } from './received-audio.mjs';

const { values } = parseArgs({ options: {
  out: { type: 'string' }, cloudflared: { type: 'string' }, ffmpeg: { type: 'string' },
  from: { type: 'string' }, trials: { type: 'string', default: '3' },
  voices: { type: 'string', default: 'marin,cedar,gleam,meridian' }, application: { type: 'string' },
  'dns-server': { type: 'string' },
} });
for (const k of ['out', 'cloudflared', 'ffmpeg', 'from']) assert.ok(values[k], `--${k} is required`);
for (const k of ['OPENAI_API_KEY', 'TELNYX_API_KEY', 'TELNYX_PUBLIC_KEY', 'TELNYX_CONNECTION_ID']) assert.ok(process.env[k], `${k} is required`);
const out = resolve(values.out);
const repository = resolve(import.meta.dirname, '..');
assert.ok(out !== repository && !out.startsWith(repository + '/'), 'raw evidence must stay outside this repository');
const voices = values.voices.split(',');
assert.ok(voices.every(v => ['marin', 'cedar', 'gleam', 'meridian'].includes(v)), 'unsupported voice');
const count = Number(values.trials);
assert.ok(Number.isInteger(count) && count >= 1 && count <= 5, 'trials must be 1 to 5');
mkdirSync(out, { recursive: true, mode: 0o700 });
assert.ok(!readdirSync(out).some(name => /^t\d+-/.test(name)), 'choose a fresh trial directory to preserve existing evidence');
const save = (name, data) => writeFileSync(join(out, name), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2), { mode: 0o600 });
const token = randomUUID();
let subdomain = `testvoices${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const streamOptions = { stream_track: 'inbound_track', stream_codec: 'PCMU', stream_bidirectional_mode: 'rtp', stream_bidirectional_codec: 'PCMU' };
const instructions = 'You are on an automated test phone call. Speak English. When asked, read the appointment date October 12, 2026, the time 7:15 PM Pacific time, and reference code B7Q29. Say each letter and digit of the code separately. Wait for the other side. If they correct the date or time, read back the corrected date and time and the unchanged reference code. Do not make a booking or perform any action. After they say the test is complete, say goodbye and stop speaking.';
const prompts = [
  'This is the automated voice test line. Please read the appointment date, time, time zone and reference code.',
  'Correction. Change the appointment to October twenty second, twenty twenty six, at six forty five P M Pacific time. Keep the same reference code. Please read back the corrected date, time, time zone and reference code.',
  'Thank you. The test is complete. Goodbye.',
];
const delay = ms => new Promise(r => setTimeout(r, ms));
async function health(url) {
  if (!values['dns-server']) {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok && await response.text() === 'received voice fixture ready';
  }
  // An explicit resolver is useful on networks returning stale NXDOMAIN for
  // newly provisioned tunnel names. TLS still verifies the original hostname.
  const resolver = new Resolver();
  resolver.setServers([values['dns-server']]);
  return new Promise((resolveHealth, reject) => {
    const request = httpsGet(url, { lookup: (host, options, callback) => {
      resolver.resolve4(host).then(addresses => {
        if (options.all) callback(null, addresses.map(address => ({ address, family: 4 })));
        else callback(null, addresses[0], 4);
      }, callback);
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolveHealth(response.statusCode === 200 && Buffer.concat(chunks).toString() === 'received voice fixture ready'));
    });
    request.setTimeout(5000, () => request.destroy(Error('fixture health request timed out')));
    request.on('error', reject);
  });
}
async function api(method, path, body) {
  const response = await fetch('https://api.telnyx.com/v2' + path, {
    method, headers: { authorization: 'Bearer ' + process.env.TELNYX_API_KEY, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Telnyx ${method} ${path.split('/').slice(0, 2).join('/')}: ${response.status} ${JSON.stringify(result.errors)}`);
  return result.data;
}
async function command(control, action, body = {}) {
  return api('POST', `/calls/${encodeURIComponent(control)}/actions/${action}`, { ...body, command_id: randomUUID() });
}
const ffmpeg = (...args) => execFileSync(values.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const audioPrompts = [];
for (let i = 0; i < prompts.length; i++) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'ash', input: prompts[i], response_format: 'wav' }),
    signal: AbortSignal.timeout(60_000),
  });
  assert.ok(r.ok, `prompt TTS failed: ${r.status}`);
  save(`prompt-${i}.wav`, Buffer.from(await r.arrayBuffer()));
  ffmpeg('-i', join(out, `prompt-${i}.wav`), '-ar', '8000', '-ac', '1', '-f', 'mulaw', join(out, `prompt-${i}.ulaw`));
  audioPrompts.push(readFileSync(join(out, `prompt-${i}.ulaw`)));
}
save('method.json', { model: 'gpt-live-1', instructions, prompts, voices, trials: count, route: 'Telnyx SIP subdomain, PCMU 8000 Hz', receivedTimestampUnit: '8000 Hz sample clock, verified on 160 sample packets', receiver: 'fixed synthetic TTS, gpt-4o-mini-tts ash', createdAt: new Date().toISOString() });

const trials = new Map();
const seen = new Set();
let appId;
let publicUrl;
let tunnel;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/health' && req.method === 'GET') { res.writeHead(200).end('received voice fixture ready'); return; }
    if (req.url !== `/hooks/${token}` || req.method !== 'POST') { res.writeHead(404).end(); return; }
    const chunks = [];
    for await (const chunk of req) { chunks.push(chunk); if (chunks.reduce((n, x) => n + x.length, 0) > 100_000) throw Error('oversized webhook'); }
    const body = Buffer.concat(chunks).toString();
    const valid = await verifyTelnyxSignature({ publicKeyB64: process.env.TELNYX_PUBLIC_KEY, signatureB64: req.headers['telnyx-signature-ed25519'], timestamp: req.headers['telnyx-timestamp'], body });
    if (!valid) { res.writeHead(400).end(); return; }
    const hook = JSON.parse(body).data;
    if (seen.has(hook.id)) { res.writeHead(200).end('ok'); return; }
    const p = hook.payload;
    const trial = [...trials.values()].find(t => p.call_control_id === t.senderControl || p.call_control_id === t.receiverControl || (p.to?.includes(t.sipUser) && p.direction === 'incoming') || p.client_state === Buffer.from(t.id).toString('base64'));
    if (!trial) { res.writeHead(200).end('unrelated'); return; }
    trial.events.push(hook);
    appendFileSync(join(out, `${trial.id}-${trial.voice}-events.private.jsonl`), JSON.stringify(hook) + '\n', { mode: 0o600 });
    if (hook.event_type === 'call.initiated' && p.direction === 'incoming') {
      assert.equal(p.connection_id, appId, 'wrong receiving application');
      trial.receiverControl = p.call_control_id;
      trial.receiverLeg = p.call_leg_id;
      await command(p.call_control_id, 'answer', {
        stream_url: publicUrl.replace('https:', 'wss:') + `/stream/${token}/${trial.id}/receiver`,
        time_limit_secs: 100, ...streamOptions,
      });
    }
    if (hook.event_type === 'call.hangup') {
      trial.hangups.push({ direction: p.direction, cause: p.hangup_cause, at: hook.occurred_at });
      if (p.call_control_id === trial.senderControl) trial.ended = true;
    }
    seen.add(hook.id);
    res.writeHead(200).end('ok');
  } catch (e) { console.error('webhook:', e.message); res.writeHead(500).end(); }
});
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const parts = req.url.split('/');
  const trial = trials.get(parts[3]);
  if (parts[1] !== 'stream' || parts[2] !== token || !trial || !['sender', 'receiver'].includes(parts[4])) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => attach(ws, trial, parts[4]));
});

function attach(ws, t, role) {
  t[role + 'Socket'] = ws;
  let started = false;
  const pending = [];
  let live;
  let liveReady = false;
  let promptPlaying = false;
  let stage = 0;
  let replyBytes = 0;
  let lastSpeech = 0;
  let promptEndedAt = 0;
  let quietTimer;
  const send = payload => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'media', media: { payload: payload.toString('base64') } })); };
  async function play(index) {
    promptPlaying = true;
    t.phases.push({ phase: index, at: Date.now(), receivedFrames: t.received.length });
    console.log(JSON.stringify({ id: t.id, voice: t.voice, phase: index }));
    const audio = audioPrompts[index];
    for (let at = 0; at < audio.length && ws.readyState === WebSocket.OPEN; at += 160) { send(audio.subarray(at, at + 160)); await delay(20); }
    promptPlaying = false;
    promptEndedAt = Date.now();
    lastSpeech = 0;
    replyBytes = 0;
    if (index === 2) { await delay(4000); await stop(t); }
  }
  ws.on('message', bytes => {
    try {
      const event = JSON.parse(bytes.toString());
      if (event.event === 'start') {
        if (started) return;
        started = true;
        t[role + 'Format'] = event.start.media_format;
        save(`${t.id}-${t.voice}-${role}-start.private.json`, event);
        assert.equal(event.start.media_format.encoding, 'PCMU');
        assert.equal(event.start.media_format.sample_rate, 8000);
        if (role === 'receiver') {
          t.receivedStartedAt = Date.now();
          setTimeout(() => void play(0).catch(e => { t.error = e.message; void stop(t); }), 1500);
          quietTimer = setInterval(() => {
            if (!promptPlaying && stage < 2 && replyBytes > 8000 && lastSpeech && Date.now() - lastSpeech > 2000 && Date.now() - promptEndedAt > 3500) {
              stage++;
              void play(stage).catch(e => { t.error = e.message; void stop(t); });
            }
          }, 100);
        } else {
          live = new WebSocket('wss://api.openai.com/v1/live/sessions', { headers: { authorization: 'Bearer ' + process.env.OPENAI_API_KEY } });
          live.on('open', () => live.send(JSON.stringify({ type: 'session.start', session: { model: 'gpt-live-1', instructions, audio: { format: { type: 'audio/pcmu', rate: 8000 }, output: { voice: t.voice } } } })));
          live.on('message', raw => {
            const e = JSON.parse(raw.toString());
            if (e.type === 'session.started') { liveReady = true; for (const payload of pending.splice(0)) live.send(JSON.stringify({ type: 'session.input_audio.append', audio: payload })); }
            else if (e.type === 'session.output_audio.delta') send(Buffer.from(e.delta, 'base64'));
            else if (e.type.includes('transcript')) t.modelTranscript.push({ at: Date.now(), ...e });
            else if (e.type === 'error') { t.error = JSON.stringify(e.error); void stop(t); }
          });
          live.on('error', e => { t.error = e.message; void stop(t); });
        }
      } else if (event.event === 'media' && event.media.track === 'inbound') {
        const audio = Buffer.from(event.media.payload, 'base64');
        if (role === 'receiver') {
          if (!t.received.length) console.log(JSON.stringify({ id: t.id, firstTimestamp: event.media.timestamp, firstChunk: event.media.chunk, frameBytes: audio.length }));
          appendFileSync(join(out, `${t.id}-${t.voice}-received.private.jsonl`), JSON.stringify(event.media) + '\n', { mode: 0o600 });
          t.received.push({ timestamp: Number(event.media.timestamp), chunk: Number(event.media.chunk), audio });
          if (!promptPlaying && hasSpeech(audio)) { replyBytes += audio.length; lastSpeech = Date.now(); }
        } else if (liveReady && live?.readyState === WebSocket.OPEN) live.send(JSON.stringify({ type: 'session.input_audio.append', audio: event.media.payload }));
        else if (pending.length < 500) pending.push(event.media.payload);
      }
    } catch (e) { t.error = e.message; void stop(t); }
  });
  ws.on('close', () => { clearInterval(quietTimer); if (live) live.close(); });
}
async function stop(t) {
  if (t.stopping) return;
  t.stopping = true;
  if (t.senderControl) {
    try { await command(t.senderControl, 'hangup'); } catch (e) { t.stopError = e.message; }
  }
}

try {
  const numbers = await api('GET', '/phone_numbers?page[size]=100');
  assert.ok(numbers.some(n => n.phone_number === values.from), 'caller ID must be an owned Telnyx number');
  const source = await api('GET', '/call_control_applications/' + process.env.TELNYX_CONNECTION_ID);
  await new Promise(r => server.listen(8788, '127.0.0.1', r));
  // A user's default cloudflared configuration may contain unrelated ingress
  // routes. Use an explicit empty test configuration instead of inheriting it.
  save('cloudflared-test.yml', '{}\n');
  tunnel = spawn(values.cloudflared, ['tunnel', '--config', join(out, 'cloudflared-test.yml'), '--url', 'http://127.0.0.1:8788', '--no-autoupdate'], { stdio: ['ignore', 'ignore', 'pipe'] });
  tunnel.stderr.on('data', raw => appendFileSync(join(out, 'cloudflared.private.log'), raw, { mode: 0o600 }));
  publicUrl = await new Promise((r, reject) => {
    const timeout = setTimeout(() => reject(Error('tunnel setup timed out')), 30_000);
    tunnel.stderr.on('data', raw => { const match = raw.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (match) { clearTimeout(timeout); r(match[0]); } });
    tunnel.on('exit', code => { clearTimeout(timeout); reject(Error(`tunnel exited: ${code}`)); });
  });
  save('endpoint.private.json', { url: publicUrl, hookPath: `/hooks/${token}` });
  // Wait for the tunnel to serve requests before registering its webhook URL.
  let ready = false;
  let readinessStatus;
  for (let attempt = 0; attempt < 90 && !ready; attempt++) {
    try {
      ready = await health(publicUrl + '/health');
      readinessStatus = ready ? 'ready' : 'unexpected health response';
    } catch (e) { readinessStatus = e.cause?.code ?? e.message; }
    if (!ready) await delay(1000);
  }
  assert.ok(ready, `tunnel did not become reachable (${readinessStatus})`);
  let application;
  if (values.application) {
    application = await api('GET', '/call_control_applications/' + values.application);
    assert.ok(application.application_name.startsWith('test-received-voices-'), 'only this evaluation fixture may be reused');
    assert.equal(application.active, false, 'do not repurpose an active application');
    appId = application.id;
    subdomain = application.inbound.sip_subdomain;
    application = await api('PATCH', '/call_control_applications/' + values.application, { active: true, webhook_event_url: publicUrl + `/hooks/${token}` });
  } else application = await api('POST', '/call_control_applications', {
    application_name: 'test-received-voices-' + new Date().toISOString().slice(0, 10) + '-' + subdomain.slice(-8),
    webhook_event_url: publicUrl + `/hooks/${token}`, webhook_api_version: '2', active: true,
    inbound: { sip_subdomain: subdomain, sip_subdomain_receive_settings: 'only_my_connections', channel_limit: 1 },
    outbound: { outbound_voice_profile_id: source.outbound.outbound_voice_profile_id, channel_limit: 1 },
  });
  appId = application.id;
  save('application.private.json', application);
  // Newly provisioned applications must propagate before the first dial.
  await delay(5000);
  for (let round = 0; round < count; round++) {
    const order = round % 2 ? [...voices].reverse() : [...voices.slice(round % voices.length), ...voices.slice(0, round % voices.length)];
    for (const voice of order) {
      const id = `t${trials.size + 1}`;
      const t = { id, sipUser: String(12025550100 + trials.size + 1), voice, round: round + 1, phases: [], events: [], received: [], modelTranscript: [], hangups: [], startedAt: new Date().toISOString() };
      trials.set(id, t);
      const call = await api('POST', '/calls', { connection_id: appId, to: `sip:${t.sipUser}@${subdomain}.sip.telnyx.com`, from: values.from, timeout_secs: 20, time_limit_secs: 100,
        client_state: Buffer.from(id).toString('base64'), webhook_url: publicUrl + `/hooks/${token}`,
        stream_url: publicUrl.replace('https:', 'wss:') + `/stream/${token}/${id}/sender`, ...streamOptions });
      t.senderControl = call.call_control_id;
      t.senderLeg = call.call_leg_id;
      save(`${id}-${voice}-dial.private.json`, call);
      const deadline = Date.now() + 105_000;
      while (!t.ended && Date.now() < deadline) await delay(200);
      await stop(t);
      await delay(1500);
      t.senderSocket?.close(); t.receiverSocket?.close();
      const { received: ignored, senderSocket, receiverSocket, ...metadata } = t;
      save(`${id}-${voice}.private.json`, metadata);
      const frames = [...t.received].sort((a, b) => a.timestamp - b.timestamp || a.chunk - b.chunk);
      const { audio: received, leadingMillis, missingMillis, duplicateBytes } = assembleReceivedAudio(frames);
      save(`${id}-${voice}.ulaw`, received);
      if (received.length) ffmpeg('-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', join(out, `${id}-${voice}.ulaw`), join(out, `${id}-${voice}.wav`));
      save(`${id}-${voice}.private.json`, { ...metadata, receivedDurationSeconds: received.length / 8000, frameCount: frames.length, leadingMillis, missingMillis, duplicateBytes });
      console.log(JSON.stringify({ id, voice, round: t.round, receivedSeconds: received.length / 8000, phases: t.phases.length, error: t.error ?? null, hangups: t.hangups }));
      if (!received.length || t.error || t.phases.length !== 3) throw Error(`${id}: incomplete trial, inspect private evidence before continuing`);
    }
  }
} finally {
  try {
    for (const t of trials.values()) await stop(t);
    if (appId) { await api('PATCH', '/call_control_applications/' + appId, { active: false }); console.log('Isolated test application deactivated'); }
  } finally {
    wss.clients.forEach(ws => ws.close());
    wss.close(); server.close(); tunnel?.kill('SIGTERM');
  }
}
