import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { CODE_ATTEMPTS, VERIFICATIONS_PER_DAY } from '../src/server/lib/number-schema';
import { checkDialable } from '../src/server/lib/phone';
import type { Account } from '../src/server/services/accounts';
import { NumberError, numbers, ownNumberRefusal } from '../src/server/services/numbers';
import { callInstructions, type CallBrief } from '../src/server/voice/prompt';
import { d1 } from './sqlite-d1';

/** Telnyx as these tests need it: which numbers it lists as verified, the codes it sent, and every request. */
const carrier = { verified: new Set<string>(), codes: new Map<string, string>(), requests: [] as { method: string; path: string; body: Record<string, unknown> | null }[] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const path = decodeURIComponent(url.pathname.replace(/^\/v2/, ''));
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  const method = init?.method ?? 'GET';
  carrier.requests.push({ method, path, body });
  const number = /^\/verified_numbers\/([^/]+)/.exec(path)?.[1];
  if (method === 'GET' && number) return carrier.verified.has(number) || carrier.codes.has(number) ? json(200, { data: { phone_number: number, verified_at: carrier.verified.has(number) ? '2026-10-01T00:00:00' : null } }) : json(404, { errors: [{ code: '10005' }] });
  if (method === 'POST' && path === '/verified_numbers') {
    carrier.codes.set(body!.phone_number as string, '123456');
    return json(200, { phone_number: body!.phone_number, verification_method: body!.verification_method });
  }
  if (method === 'POST' && number && path.endsWith('/actions/verify')) {
    if (carrier.codes.get(number) !== body!.verification_code) return json(422, { errors: [{ code: '10027', detail: 'Invalid verification code' }] });
    carrier.verified.add(number);
    return json(200, { data: { phone_number: number, verified_at: '2026-10-01T00:00:00' } });
  }
  if (method === 'DELETE' && number) return carrier.verified.delete(number) ? json(200, { data: { phone_number: number } }) : json(404, { errors: [{ code: '10005' }] });
  throw new Error(`unexpected carrier request ${method} ${path}`);
}) as typeof fetch;

const alice = { id: 'acct_alice' } as Account;
const bob = { id: 'acct_bob' } as Account;
const mine = '+12025550123';
let env: Env;
const sent = (method: string, path: string) => carrier.requests.filter((r) => r.method === method && r.path === path);

beforeEach(() => {
  env = { DB: d1(), TELNYX_API_KEY: 'test', TELNYX_CONNECTION_ID: 'conn' } as unknown as Env;
  carrier.verified.clear();
  carrier.codes.clear();
  carrier.requests.length = 0;
});

async function refusal(p: Promise<unknown>, status: number, message: RegExp) {
  await assert.rejects(p, (err: unknown) => err instanceof NumberError && err.status === status && message.test(err.message));
}

async function verify(account: Account, number = mine) {
  await numbers(env).startVerification(account, { number, method: 'sms' });
  return numbers(env).confirmVerification(account, number, '123456');
}

test('a number is the account\'s once the code the carrier sent comes back', async () => {
  const n = numbers(env);
  const pending = await n.startVerification(alice, { number: '(202) 555-0123', method: 'sms' });
  assert.deepEqual([pending.e164, pending.status], [mine, 'pending']);
  assert.deepEqual(sent('POST', '/verified_numbers').map((r) => r.body), [{ phone_number: mine, verification_method: 'sms' }]);
  const verified = await n.confirmVerification(alice, mine, '123456');
  assert.equal(verified.status, 'verified');
  assert.deepEqual((await n.ownViews(alice.id)).map((v) => [v.e164, v.status]), [[mine, 'verified']]);
});

test('a verification call can dial an extension; a text cannot', async () => {
  const n = numbers(env);
  await refusal(n.startVerification(alice, { number: mine, method: 'sms', extension: 'ww243' }), 400, /extension/);
  await n.startVerification(alice, { number: mine, method: 'call', extension: 'ww243' });
  assert.deepEqual(sent('POST', '/verified_numbers').at(-1)!.body, { phone_number: mine, verification_method: 'call', extension: 'ww243' });
});

test('a number verified on one account cannot be verified on another', async () => {
  await verify(alice);
  await refusal(numbers(env).startVerification(bob, { number: mine, method: 'sms' }), 409, /another call4me account/);
  await refusal(numbers(env).startVerification(alice, { number: mine, method: 'sms' }), 409, /already verified on this account/);
});

test('a number the carrier already lists as verified is never handed out without a fresh code', async () => {
  carrier.verified.add(mine);
  await refusal(numbers(env).startVerification(alice, { number: mine, method: 'sms' }), 409, /can't be verified/);
  assert.equal(sent('POST', '/verified_numbers').length, 0);
});

test('a code is refused once another request for the number got verified at the carrier first', async () => {
  const n = numbers(env);
  await n.startVerification(alice, { number: mine, method: 'sms' });
  carrier.verified.add(mine);
  await refusal(n.confirmVerification(alice, mine, '123456'), 409, /can't be verified/);
  assert.equal(sent('POST', `/verified_numbers/${mine}/actions/verify`).length, 0);
});

test(`wrong codes count down from ${CODE_ATTEMPTS}, then a new code is needed`, async () => {
  const n = numbers(env);
  await n.startVerification(alice, { number: mine, method: 'sms' });
  for (let left = CODE_ATTEMPTS - 1; left > 0; left--) await refusal(n.confirmVerification(alice, mine, '000000'), 400, new RegExp(`${left} tr(y|ies) left`));
  await refusal(n.confirmVerification(alice, mine, '000000'), 400, /request a new code/);
  await refusal(n.confirmVerification(alice, mine, '123456'), 404, /request one first/);
  assert.deepEqual(await n.ownViews(alice.id), []);
});

test(`at most ${VERIFICATIONS_PER_DAY} codes a day per account`, async () => {
  const n = numbers(env);
  for (let i = 0; i < VERIFICATIONS_PER_DAY; i++) await n.startVerification(alice, { number: mine, method: 'sms' });
  await refusal(n.startVerification(alice, { number: '+12025550199', method: 'sms' }), 429, /codes a day/);
  // Each new request supersedes the last: one number waiting, not five.
  assert.equal((await n.ownViews(alice.id)).length, 1);
});

test('call4me numbers and numbers in countries call4me does not call from cannot be verified', async () => {
  await env.DB.prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, status, created_at) VALUES ('n1', 'acct_bob', '+12025550111', 'US', 'local', 1, 0, 'active', 0)`).run();
  await refusal(numbers(env).startVerification(alice, { number: '+12025550111', method: 'sms' }), 409, /is a call4me number/);
  await refusal(numbers(env).startVerification(alice, { number: '+81 3 1234 5678', method: 'sms' }), 400, /doesn't place calls in JP/);
  await refusal(numbers(env).startVerification(alice, { number: '911', method: 'sms' }), 400, /number:/);
});

test('an own number is the caller ID only when requested, and only within its country', async () => {
  await env.DB.prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, status, created_at) VALUES ('n1', 'acct_alice', '+12025550111', 'US', 'local', 1, 0, 'active', 0)`).run();
  await verify(alice);
  const n = numbers(env);
  const business = checkDialable('+1 415 555 0100');
  const london = checkDialable('+44 20 7946 0958');
  assert.ok(business.ok && london.ok);
  assert.deepEqual(await n.callerId(alice, business), { number: '+12025550111', own: false });
  assert.deepEqual(await n.callerId(alice, business, '(202) 555-0123'), { number: mine, own: true });
  await refusal(n.callerId(alice, london, mine), 422, /can only call US and Canadian numbers/);
  await refusal(n.callerId(bob, business, mine), 400, /not one of this account's numbers/);
});

test('removing a verified number takes it off the carrier\'s list, so the next account starts from a fresh code', async () => {
  await verify(alice);
  await numbers(env).removeOwn(alice, mine);
  assert.deepEqual(sent('DELETE', `/verified_numbers/${mine}`).length, 1);
  assert.deepEqual(await numbers(env).ownViews(alice.id), []);
  const again = await verify(bob);
  assert.equal(again.status, 'verified');
});

test('a number waiting on its code is dropped without touching the carrier', async () => {
  await numbers(env).startVerification(alice, { number: mine, method: 'sms' });
  await numbers(env).removeOwn(alice, mine);
  assert.equal(carrier.requests.filter((r) => r.method === 'DELETE').length, 0);
  await refusal(numbers(env).removeOwn(alice, mine), 404, /no such number/);
});

test('own numbers reach their own country, and +1 numbers all of the US and Canada', () => {
  const to = (n: string) => {
    const p = checkDialable(n);
    assert.ok(p.ok);
    return p;
  };
  assert.equal(ownNumberRefusal({ phone_number: mine, country: 'US' }, to('+1 604 555 0100')), null);
  assert.equal(ownNumberRefusal({ phone_number: '+442079460958', country: 'GB' }, to('+44 161 496 0000')), null);
  assert.match(ownNumberRefusal({ phone_number: '+442079460958', country: 'GB' }, to('+33 1 23 45 67 89'))!, /United Kingdom/);
});

test('the caller tells businesses that a callback to the owner\'s own number reaches them directly', () => {
  const brief: CallBrief = { onBehalfOf: 'Sam', owner: 'Sam', business: 'Nopa', goal: 'Book a table.', facts: '', flexibility: '', callbackNumber: mine, callbackRingsOwner: true, localTime: null, connectWhen: null };
  assert.match(callInstructions(brief), /callback number is 202-555-0123, Sam's own phone: a callback reaches Sam directly/);
  assert.doesNotMatch(callInstructions({ ...brief, callbackRingsOwner: false }), /own phone/);
});
