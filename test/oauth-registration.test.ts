import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/server/lib/context';
import { mountAuth, withNativeDefault } from '../src/server/lib/auth';
import { d1 } from './sqlite-d1';

const app = new Hono<AppEnv>();
mountAuth(app);
const env = { DB: d1(), BETTER_AUTH_SECRET: 'test-only-registration-secret-0123456789', APP_NAME: 'call4me' } as unknown as Env;

// Each registration from its own address, as distinct agents are.
let visitor = 0;
const register = (metadata: Record<string, unknown>) =>
  app.request(
    'https://call4.me/api/auth/oauth2/register',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `203.0.113.${++visitor}` },
      body: JSON.stringify({ client_name: 'agent', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', ...metadata }),
    },
    env,
  );

test('an agent listening on localhost registers without declaring itself native', async () => {
  for (const uri of ['http://localhost:3000/callback', 'http://127.0.0.1:19876/mcp/oauth/callback', 'http://[::1]:8080/cb']) {
    const res = await register({ redirect_uris: [uri] });
    assert.equal(res.status, 201, `${uri}: ${await res.clone().text()}`);
    const client = (await res.json()) as { redirect_uris: string[]; application_type: string };
    assert.deepEqual(client.redirect_uris, [uri]);
    assert.equal(client.application_type, 'native');
  }
});

test('a hosted client still registers as a web application', async () => {
  const res = await register({ redirect_uris: ['https://www.cursor.com/agents/mcp/oauth/callback'] });
  assert.equal(res.status, 201);
  assert.equal(((await res.json()) as { application_type: string }).application_type, 'web');
});

test('a declared application type is never overridden', async () => {
  const res = await register({ application_type: 'web', redirect_uris: ['http://localhost:3000/callback'] });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, 'invalid_redirect_uri');
});

test('only clients whose every redirect is native default to native', () => {
  const mixed = { redirect_uris: ['http://localhost:3000/cb', 'https://example.com/cb'] };
  assert.equal(withNativeDefault(mixed), mixed);
  assert.equal((withNativeDefault({ redirect_uris: ['com.example.app:/oauth'] }) as { application_type: string }).application_type, 'native');
  const remote = { redirect_uris: ['http://localhost.evil.com/cb'] };
  assert.equal(withNativeDefault(remote), remote);
  assert.equal(withNativeDefault(null), null);
});

test('on a phone, consent to an agent on localhost shows the link to send it instead of a dead redirect', async () => {
  const { hashPassword } = await import('better-auth/crypto');
  const { sessionAccount } = await import('../src/server/lib/auth');
  const { authRoutes } = await import('../src/server/routes/auth');
  const site = new Hono<AppEnv>();
  mountAuth(site);
  site.use('*', async (c, next) => {
    c.set('account', await sessionAccount(c));
    await next();
  });
  site.route('/', authRoutes);
  const at = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Pat', 'pat@example.com', 1, ?, ?)`).bind(at, at).run();
  await env.DB.prepare(`INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES ('a1', 'u1', 'credential', 'u1', ?, ?, ?)`).bind(await hashPassword('correct horse battery'), at, at).run();
  const signIn = await site.request('https://call4.me/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://call4.me' }, body: JSON.stringify({ email: 'pat@example.com', password: 'correct horse battery' }) }, env);
  assert.equal(signIn.status, 200, await signIn.clone().text());
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

  const consentTo = async (redirectUri: string, userAgent: string) => {
    const registered = await register({ redirect_uris: [redirectUri] });
    assert.equal(registered.status, 201, await registered.clone().text());
    const { client_id } = (await registered.json()) as { client_id: string };
    const authorize = new URL('https://call4.me/api/auth/oauth2/authorize');
    for (const [k, v] of Object.entries({ response_type: 'code', client_id, redirect_uri: redirectUri, scope: 'calls offline_access', state: 'st', code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', code_challenge_method: 'S256', resource: 'https://call4.me/mcp' })) authorize.searchParams.set(k, v);
    const toConsent = await site.request(authorize.toString(), { headers: { cookie } }, env);
    const consent = new URL(toConsent.headers.get('location') ?? '', 'https://call4.me');
    assert.equal(consent.pathname, '/oauth/consent', `${toConsent.status} ${consent}`);
    const form = new FormData();
    form.set('oauth_query', consent.search.slice(1));
    form.set('decision', 'allow');
    return site.request('https://call4.me/oauth/consent', { method: 'POST', headers: { cookie, 'user-agent': userAgent }, body: form }, env);
  };

  const phone = await consentTo('http://localhost:3000/callback', 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148');
  assert.equal(phone.status, 200);
  const page = await phone.text();
  assert.match(page, /one more step/);
  assert.match(page, /http:\/\/localhost:3000\/callback\?code=[^"&]+&amp;state=st/);

  const desktop = await consentTo('http://127.0.0.1:4000/callback', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36');
  assert.equal(desktop.status, 303);
  assert.match(desktop.headers.get('location') ?? '', /^http:\/\/127\.0\.0\.1:4000\/callback\?code=/);
});

test('rate limits count each visitor by the address Cloudflare saw, not one bucket for everyone', async () => {
  const signIn = (ip: string) =>
    app.request('https://call4.me/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://call4.me', 'cf-connecting-ip': ip }, body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong password' }) }, env);
  for (let i = 0; i < 3; i++) assert.notEqual((await signIn('198.51.100.7')).status, 429);
  assert.equal((await signIn('198.51.100.7')).status, 429);
  assert.notEqual((await signIn('198.51.100.8')).status, 429);
});
