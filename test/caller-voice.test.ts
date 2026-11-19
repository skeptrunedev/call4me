import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import type { AppEnv } from '../src/server/lib/context';
import { accounts, type Account } from '../src/server/services/accounts';
import { answerInbound, placeCall } from '../src/server/services/dialer';
import { savedContext, voiceOf } from '../src/server/services/intake';
import { ProfileError, profiles } from '../src/server/services/profiles';
import { pub } from '../src/server/routes/public';
import { d1 } from './sqlite-d1';
import { executionCtx, installEdgeCache } from './edge-cache';

installEdgeCache();

const NUMBER = '+14155550111';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Alice with $100 (each call holds its maximum), a number, and a voice session and carrier that record every call's setup. */
async function harness() {
  const db = d1();
  const run = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();
  await run(`UPDATE accounts SET display_name = 'Alice' WHERE id = 'acct_alice'`);
  await run(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l1', 'acct_alice', 10000, 'topup', 'test:topup', 'card', 0)`);
  await run(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at) VALUES ('n1', 'acct_alice', ?, 'US', 'local', 1, 0, NULL, 'active', 0)`, NUMBER);
  const setups: { voice: string; answering?: boolean }[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (init?.method === 'POST' && url.pathname === '/v2/calls') return json(200, { data: { call_control_id: `v3:${Math.random()}` } });
    return json(200, { data: {} });
  }) as typeof fetch;
  const env = {
    DB: db,
    PRICE_PER_MINUTE_CENTS: '25',
    TELNYX_API_KEY: 'test',
    TELNYX_CONNECTION_ID: 'conn',
    STREAM_SECRET: 'secret',
    VOICE_HOST: 'voice.example',
    VOICE_SESSION: {
      idFromName: (n: string) => n,
      get: () => ({
        fetch: async (url: string, init?: RequestInit) => {
          if (new URL(url).pathname === '/setup') setups.push(JSON.parse(String(init!.body)));
          return new Response('ok');
        },
      }),
    },
  } as unknown as Env;
  const alice = (await accounts(db).byId('acct_alice')) as Account;
  const input = { to: '+1 415 555 0123', business: 'Rosa', category: 'general', goal: 'Ask their hours', details: { questions: 'What are your hours?' } };
  const place = (voice?: 'cedar' | 'willow') => placeCall(env, 'https://call4.me', alice, { ...input, ...(voice ? { voice } : {}) });
  const answer = () => answerInbound(env, 'https://call4.me', { controlId: `v3:ringing-${setups.length}`, from: '+14155550199', to: NUMBER });
  return { db, setups, place, answer };
}

test('a caller voice saves on the profile in any case, and anything else is refused', async () => {
  const db = d1();
  assert.equal(voiceOf(await profiles(db).get('acct_alice')), 'marin', 'unset is marin');
  assert.equal((await profiles(db).update('acct_alice', { voice: ' Gleam ' })).voice, 'gleam');
  assert.equal(voiceOf(await profiles(db).get('acct_alice')), 'gleam');
  await assert.rejects(profiles(db).update('acct_alice', { voice: 'alloy' }), (err: Error) => err instanceof ProfileError && /voice: pick one of marin, cedar/.test(err.message));
  assert.equal((await profiles(db).update('acct_alice', { voice: '' })).voice, undefined, 'blank removes it');
  assert.equal(voiceOf({ voice: 'retired-voice' }), 'marin', 'a voice no longer offered falls back');
});

test("the saved voice is how the caller sounds, not a fact it shares", () => {
  const known = savedContext({ voice: 'cedar', full_name: 'Alice Doe' }, ['voice', 'full_name'], { known: [], missing: [], invalid: [] });
  assert.deepEqual(known.map((k) => k.key), ['full_name']);
});

test("every call the account places or answers uses its saved voice, and a call's own voice wins", async () => {
  const h = await harness();
  await h.place();
  assert.equal(h.setups.at(-1)!.voice, 'marin', 'nothing saved');
  await profiles(h.db).update('acct_alice', { voice: 'cedar' });
  await h.place();
  assert.equal(h.setups.at(-1)!.voice, 'cedar');
  await h.place('willow');
  assert.equal(h.setups.at(-1)!.voice, 'willow', 'for this call only');
  await h.answer();
  assert.equal(h.setups.at(-1)!.answering, true);
  assert.equal(h.setups.at(-1)!.voice, 'cedar', 'answered calls too');
});

test('the calling profile picks the voice from a list, with the saved one selected', async () => {
  const sqlite = d1();
  const db = Object.assign(sqlite, { withSession: () => sqlite as unknown as D1DatabaseSession });
  const app = new Hono<AppEnv>();
  app.use('*', contextStorage());
  app.use('*', async (c, next) => {
    c.set('account', await accounts(db).byId('acct_alice'));
    await next();
  });
  app.route('/', pub);
  const env = { DB: db, BETTER_AUTH_SECRET: 'test-secret', PRICE_PER_MINUTE_CENTS: '25' } as unknown as Env;
  const request = (path: string, method = 'GET', body?: string) =>
    app.request(`https://call4.me${path}`, { method, headers: { origin: 'https://call4.me', 'content-type': 'application/x-www-form-urlencoded' }, ...(body === undefined ? {} : { body }) }, env, executionCtx);

  let html = await (await request('/account')).text();
  assert.match(html, /<label for="profile-voice">caller voice<\/label><select id="profile-voice" name="voice"><option value="" selected="">marin \(default\)<\/option><option value="cedar">cedar<\/option>/);
  assert.match(html, /<option value="vesper">vesper \(british accent\)<\/option>/);
  assert.match(html, /<a href="\/voices" class="small">hear each voice<\/a>/);

  const saved = await request('/account/profile', 'POST', 'voice=vesper');
  assert.equal(saved.status, 303);
  assert.equal((await profiles(db).get('acct_alice')).voice, 'vesper');
  html = await (await request('/account')).text();
  assert.match(html, /<option value="">marin \(default\)<\/option>/);
  assert.match(html, /<option value="vesper" selected="">vesper \(british accent\)<\/option>/);

  await request('/account/profile', 'POST', 'voice=');
  assert.equal((await profiles(db).get('acct_alice')).voice, undefined, 'back to the default');
});
