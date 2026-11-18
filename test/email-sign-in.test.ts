import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { Hono } from 'hono';
import { d1 } from './sqlite-d1';
import type { AppEnv } from '../src/server/lib/context';

const workerModule = `export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent(workerModule)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { authRoutes } = await import('../src/server/routes/auth');
const { mountAuth, sessionAccount } = await import('../src/server/lib/auth');
const { safeNext } = await import('../src/server/lib/context');

const SITE = 'https://call4.me';

/**
 * The site's sign-in pages and better-auth on SQLite, mounted as in index.tsx, with a browser's
 * cookie jar and the sign-in emails the console messenger prints (no SMTP password in tests).
 */
function site(t: TestContext) {
  const env = { DB: d1(), BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth', APP_NAME: 'call4me' } as unknown as Env;
  const app = new Hono<AppEnv>();
  mountAuth(app);
  app.use('*', async (c, next) => {
    c.set('account', await sessionAccount(c));
    await next();
  });
  app.route('/', authRoutes);
  const mail: { to: string; subject: string; text: string }[] = [];
  t.mock.method(console, 'log', (line: unknown) => {
    const m = /^\[email\] to=(\S+) subject=(.*)\n([\s\S]*)$/.exec(String(line));
    if (m) mail.push({ to: m[1], subject: m[2], text: m[3] });
  });
  let ip = 0;
  const browser = () => {
    const jar = new Map<string, string>();
    // Each browser on its own address, so better-auth's per-address rate limits don't run across tests.
    const address = `203.0.113.${++ip}`;
    const send = async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('cf-connecting-ip', address);
      if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      const res = await app.request(`${SITE}${path}`, { ...init, headers, redirect: 'manual' }, env);
      for (const cookie of res.headers.getSetCookie()) {
        const [pair] = cookie.split(';');
        const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
        if (/max-age=0/i.test(cookie) || value === '') jar.delete(name);
        else jar.set(name, value);
      }
      return res;
    };
    const post = (path: string, fields: Record<string, string>, from = SITE) => send(path, { method: 'POST', headers: { origin: from }, body: new URLSearchParams(fields) });
    const user = async () => ((await (await send('/api/auth/get-session')).json()) as { user?: { email: string; emailVerified: boolean } } | null)?.user ?? null;
    return { send, post, user, jar };
  };
  const codeIn = (m: { subject: string }) => /^call4me sign-in code: (\d{6})$/.exec(m.subject)?.[1] ?? '';
  const linkIn = (m: { text: string }) => new URL(/https:\/\/call4\.me\/login\/email\?\S+/.exec(m.text)![0]);
  return { env, mail, browser, codeIn, linkIn };
}

test('the code in the sign-in email signs in the browser it is typed into, and carries on to where sign-in was asked for', async (t) => {
  const s = site(t);
  const computer = s.browser();
  const asked = await computer.post('/login/email', { email: 'New.Person@example.com', next: '/account' });
  assert.equal(asked.status, 200);
  const page = await asked.text();
  assert.match(page, /we emailed a sign-in code and link to <b>New\.Person@example\.com<\/b>/);
  assert.match(page, /<form method="post" action="\/login\/code"/);

  assert.equal(s.mail.length, 1);
  const [email] = s.mail;
  assert.equal(email.to, 'New.Person@example.com', 'mailed as typed, as the link always was');
  const code = s.codeIn(email);
  assert.match(code, /^\d{6}$/, 'the code leads the subject, so a phone notification shows it');
  assert.match(email.text, new RegExp(`^your call4me sign-in code is ${code}\\n`));
  assert.equal(s.linkIn(email).pathname, '/login/email', 'the link is in the same email');

  const signedIn = await computer.post('/login/code', { email: 'New.Person@example.com', code: `${code.slice(0, 3)} ${code.slice(3)}`, next: '/account' });
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.headers.get('location'), '/account');
  const user = await computer.user();
  assert.equal(user?.email, 'new.person@example.com');
  assert.equal(user?.emailVerified, true);
  assert.equal((await computer.send('/login')).status, 303, 'signed in: the sign-in page sends them on');
  const account = await s.env.DB.prepare(`SELECT a.email FROM accounts a JOIN "user" u ON u.id = a.user_id WHERE u.email = 'new.person@example.com'`).first<{ email: string }>();
  assert.equal(account?.email, 'new.person@example.com', 'the first signed-in page opened their account, as after a link');

  const again = await s.browser().post('/login/code', { email: 'new.person@example.com', code, next: '/account' });
  assert.equal(again.status, 400, 'a code works once');
});

test('a code sign-in continues the OAuth flow that sent the browser to sign in', async (t) => {
  const s = site(t);
  const computer = s.browser();
  const authorize = '/api/auth/oauth2/authorize?response_type=code&client_id=claude&sig=abc';
  await computer.post('/login/email', { email: 'alice@example.com', next: authorize });
  const res = await computer.post('/login/code', { email: 'alice@example.com', code: s.codeIn(s.mail[0]), next: authorize });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), authorize);
  assert.equal((await computer.user())?.email, 'alice@example.com');
  await computer.send('/login');
  const adopted = await s.env.DB.prepare(`SELECT user_id FROM accounts WHERE id = 'acct_alice'`).first<{ user_id: string | null }>();
  assert.ok(adopted?.user_id, 'an account made before sign-in (a Checkout purchase) is adopted, as after a link');
});

test('a wrong code says so and keeps the code box; three wrong codes use it up', async (t) => {
  const s = site(t);
  const computer = s.browser();
  await computer.post('/login/email', { email: 'bob@example.com', next: '/' });
  const code = s.codeIn(s.mail[0]);
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
  const first = await computer.post('/login/code', { email: 'bob@example.com', code: wrong, next: '/' });
  assert.equal(first.status, 400);
  const page = await first.text();
  assert.match(page, /that code isn&#39;t right\. check it against the newest sign-in email\./);
  assert.match(page, /action="\/login\/code"/);
  assert.equal(computer.jar.size, 0);
  // better-auth allows three code tries a minute from one address; the code itself allows three wrong ones.
  assert.equal((await s.browser().post('/login/code', { email: 'bob@example.com', code: wrong, next: '/' })).status, 400);
  assert.equal((await s.browser().post('/login/code', { email: 'bob@example.com', code: wrong, next: '/' })).status, 400);
  const spent = await s.browser().post('/login/code', { email: 'bob@example.com', code, next: '/' });
  assert.equal(spent.status, 400);
  assert.match(await spent.text(), /too many wrong codes\. get a new one below\./);
  assert.equal((await computer.post('/login/code', { email: 'bob@example.com', code, next: '/' })).status, 400, 'still used up');
});

test('one address gets three code tries a minute', async (t) => {
  const s = site(t);
  const computer = s.browser();
  await computer.post('/login/email', { email: 'bob@example.com', next: '/' });
  for (let i = 0; i < 3; i++) await computer.post('/login/code', { email: 'bob@example.com', code: '000000', next: '/' });
  const limited = await computer.post('/login/code', { email: 'bob@example.com', code: '000000', next: '/' });
  assert.equal(limited.status, 429);
  assert.match(await limited.text(), /too many tries\. wait a minute and try again\./);
});

test("a newer email's code replaces the code before it", async (t) => {
  const s = site(t);
  const computer = s.browser();
  await computer.post('/login/email', { email: 'alice@example.com', next: '/' });
  await computer.post('/login/email', { email: 'alice@example.com', next: '/' });
  const [older, newer] = s.mail.map(s.codeIn);
  if (older !== newer) assert.equal((await s.browser().post('/login/code', { email: 'alice@example.com', code: older, next: '/' })).status, 400);
  assert.equal((await computer.post('/login/code', { email: 'alice@example.com', code: newer, next: '/' })).status, 303);
});

test('the link in the same email still signs in whichever browser opens it', async (t) => {
  const s = site(t);
  await s.browser().post('/login/email', { email: 'alice@example.com', next: '/account' });
  const phone = s.browser();
  const link = s.linkIn(s.mail[0]);
  const landing = await phone.send(link.pathname + link.search);
  assert.equal(landing.status, 200);
  assert.doesNotMatch(await landing.text(), /type the 6-digit code/, 'not connecting an app: nothing to say about other devices');
  const verified = await phone.send(`/api/auth/magic-link/verify${link.search}`);
  assert.equal(verified.status, 302);
  assert.equal(verified.headers.get('location'), `${SITE}/account`);
  assert.equal((await phone.user())?.email, 'alice@example.com');
});

test("a link opened while connecting an app says the app only hears back where it started", async (t) => {
  const s = site(t);
  await s.browser().post('/login/email', { email: 'alice@example.com', next: '/api/auth/oauth2/authorize?client_id=claude&sig=abc' });
  const link = s.linkIn(s.mail[0]);
  assert.equal(link.searchParams.get('callbackURL'), '/api/auth/oauth2/authorize?client_id=claude&sig=abc');
  const landing = await s.browser().send(link.pathname + link.search);
  assert.match(await landing.text(), /on a different device, like your computer\? type the 6-digit code from this email there instead/);
});

test("a code posted from another site doesn't sign the browser in", async (t) => {
  const s = site(t);
  const computer = s.browser();
  await computer.post('/login/email', { email: 'alice@example.com', next: '/' });
  const res = await computer.post('/login/code', { email: 'alice@example.com', code: s.codeIn(s.mail[0]), next: '/' }, 'https://evil.example');
  assert.equal(res.status, 403);
  assert.equal(computer.jar.size, 0);
});

test("the code plugin's other endpoints are off: nothing mails, checks or spends a code but the sign-in email and its form", async (t) => {
  const s = site(t);
  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json', origin: SITE }, body: JSON.stringify(body) });
  for (const path of ['/email-otp/send-verification-otp', '/email-otp/check-verification-otp', '/email-otp/verify-email', '/email-otp/request-password-reset', '/forget-password/email-otp', '/email-otp/reset-password', '/email-otp/request-email-change', '/email-otp/change-email']) {
    const res = await s.browser().send(`/api/auth${path}`, json({ email: 'alice@example.com', type: 'sign-in', otp: '123456' }));
    assert.equal(res.status, 404, path);
  }
  assert.equal(s.mail.length, 0);
});

test('a next page after a slash and a backslash is another site to a browser, and is refused', () => {
  assert.equal(safeNext('/\\evil.example'), '/');
  assert.equal(safeNext('//evil.example'), '/');
  assert.equal(safeNext('/account?x=\\y'), '/account?x=\\y');
});
