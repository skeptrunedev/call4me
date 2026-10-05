import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// The routes import the voice session, whose base class only exists on Workers.
const workerModule = `export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent(workerModule)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { addCreditsAccount, addCreditsPath, fill, render, STEPS } = await import('../src/server/services/drip');
const { pub } = await import('../src/server/routes/public');

const secret = 'test-secret';
const account = { id: 'acct123abc', email: 'test@example.com' };

// Just enough D1: the account lookup, no saved Stripe customer, and every write recorded.
const writes: unknown[][] = [];
const db = {
  prepare: (sql: string) => ({
    bind: (...args: unknown[]) => ({
      first: async () => (/FROM accounts/.test(sql) && args.includes(account.id) ? account : null),
      all: async () => ({ results: [] }),
      run: async () => {
        writes.push([sql, ...args]);
        return { meta: { changes: 1 } };
      },
    }),
  }),
};
const env = { DB: db, BETTER_AUTH_SECRET: secret, STRIPE_SECRET_KEY: 'sk_test_x' } as unknown as Env;

// Stripe's API, answered locally: every request is recorded and a checkout session returned.
const stripeCalls: { url: string; body: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://api.stripe.com/')) return realFetch(input, init);
  stripeCalls.push({ url, body: String(init?.body ?? '') });
  return new Response(JSON.stringify({ id: 'cs_test_1', object: 'checkout.session', url: 'https://checkout.stripe.com/c/cs_test_1' }), { headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

test('an add-credits link names its account and cannot be forged for another', async () => {
  const path = await addCreditsPath(secret, account.id);
  assert.match(path, /^\/add\/acct123abc-[0-9a-f]{16}$/);
  const code = path.slice('/add/'.length);
  assert.equal(await addCreditsAccount(secret, code), account.id);
  assert.equal(await addCreditsAccount(secret, code.replace('acct123abc', 'acct999zzz')), null);
  assert.equal(await addCreditsAccount(secret, code.slice(0, -1) + (code.endsWith('0') ? '1' : '0')), null);
  assert.equal(await addCreditsAccount('another-secret', code), null);
  assert.equal(await addCreditsAccount(secret, 'nodash'), null);
});

test('opening the link creates no checkout and no topup', async () => {
  writes.length = 0;
  stripeCalls.length = 0;
  const path = await addCreditsPath(secret, account.id);
  const res = await pub.request(path, {}, env);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, new RegExp(`<form method="post" action="${path}"`));
  assert.equal(stripeCalls.length, 0);
  assert.equal(writes.length, 0);
});

test('a tampered link shows a friendly error and starts nothing', async () => {
  stripeCalls.length = 0;
  const res = await pub.request('/add/acct123abc-0000000000000000', { method: 'POST' }, env);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /not valid/);
  assert.equal(stripeCalls.length, 0);
  assert.equal((await pub.request('/add/acct123abc-0000000000000000', {}, env)).status, 400);
});

test('posting the link opens a monthly, adjustable checkout for that account', async () => {
  writes.length = 0;
  stripeCalls.length = 0;
  const res = await pub.request(await addCreditsPath(secret, account.id), { method: 'POST' }, env);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), 'https://checkout.stripe.com/c/cs_test_1');
  assert.equal(stripeCalls.length, 1);
  const body = decodeURIComponent(stripeCalls[0].body);
  assert.match(body, /mode=subscription/);
  assert.match(body, /allow_promotion_codes=true/);
  assert.match(body, /adjustable_quantity\]\[enabled\]=true/);
  const topup = writes.find(([sql]) => /INSERT INTO topups/.test(String(sql)));
  assert.ok(topup, 'the topup is recorded');
  assert.ok(topup.includes(account.id), 'for the signed account');
});

test('the welcome email shows the link without a scheme and the HTML links it', async () => {
  const welcome = STEPS.find((s) => s.id === 'welcome')!;
  const addCredits = `call4.me${await addCreditsPath(secret, account.id)}`;
  const email = fill(welcome.template, { host: 'call4.me', addCredits });
  assert.ok(email.body.includes(`add credits at ${addCredits} and paste the prompt from call4.me into your agent.`));
  assert.ok(email.body.includes('7379832612'));
  assert.ok(!email.body.includes('https://'));
  const { text, html } = render(email, 'https://call4.me/unsubscribe?a=x&s=y');
  assert.ok(text.startsWith(email.body));
  assert.ok(html.includes(`<a href="https://${addCredits}">${addCredits}</a>`));
  assert.ok(html.includes('<a href="https://call4.me">call4.me</a> into your agent.'));
});
