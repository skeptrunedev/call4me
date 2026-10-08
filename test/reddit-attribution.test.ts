import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import { d1 } from './sqlite-d1';
import { redditTouchOf } from '../src/server/lib/reddit';
import { accounts } from '../src/server/services/accounts';
import { deliverReddit, reconcileReddit, redditAttribution } from '../src/server/services/reddit-attribution';
import { topups } from '../src/server/services/topups';
import { createHash } from 'node:crypto';

const at = Date.now() - 5000;
const DAY = 86_400_000;
const makeTouch = (click = 'ClickA', when = at) => redditTouchOf(new URL(`https://call4.me/blog/codex-phone-calls?rdt_cid=${click}&utm_source=reddit&utm_medium=paid_social&utm_campaign=launch&utm_term=codex&utm_content=demo`), new Headers(), when)!;
async function setup() {
  const db = d1();
  await db.prepare(`UPDATE accounts SET created_at = ? WHERE id = 'acct_alice'`).bind(at + 100).run();
  const account = (await accounts(db).byId('acct_alice'))!;
  const service = redditAttribution({ DB: db, CANONICAL_HOST: 'call4.me' });
  return { db, account, service };
}
async function events(db: D1Database) {
  return (await db.prepare(`SELECT id, event_name, payload, state FROM reddit_events ORDER BY id`).all<{ id: string; event_name: string; payload: string; state: string }>()).results;
}
async function connected(db: D1Database, id: string, ended: number, direction = 'outbound', seconds = 20) {
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, direction, status, billed_seconds, ended_at, created_at)
    VALUES (?, 'acct_alice', '+12025550123', 'Private business', 'Private goal', '{}', ?, 'completed', ?, ?, ?)`)
    .bind(id, direction, seconds, ended, ended - 30_000).run();
}

test('the same anonymous click is linked to signup, payment and later agent calls without a browser', async () => {
  const { db, account, service } = await setup();
  const touch = makeTouch();
  await service.visit(touch);
  await service.seen(account, touch);
  await service.seen(account, touch);
  await service.purchase(account, { transactionId: 'cs_1', cents: 1500, reload: false, from: touch, at: at + 500 });
  await service.purchase(account, { transactionId: 'cs_1', cents: 1500, reload: false, from: touch, at: at + 500 });
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM reddit_visits').first<{ n: number }>())!.n, 1);
  assert.equal((await db.prepare('SELECT account_id FROM reddit_visits').first<{ account_id: string }>())!.account_id, account.id);
  await connected(db, 'call_1', at + 1000);
  const fresh = (await accounts(db).byId(account.id))!;
  await service.callCompleted(fresh, 'call_1');
  await service.callCompleted(fresh, 'call_1');
  const rows = await events(db);
  assert.deepEqual(rows.map((e) => e.event_name).sort(), ['FirstCompletedCall', 'FirstPayment', 'PURCHASE', 'SIGN_UP'].sort());
  for (const e of rows) assert.match(e.payload, /ClickA/);
  assert.doesNotMatch(JSON.stringify(rows), /Private goal|Private business|12025550123|alice@example/);
  const purchase = JSON.parse(rows.find((e) => e.event_name === 'PURCHASE')!.payload).data.events[0];
  assert.equal(purchase.metadata.value, 15);
  assert.equal(purchase.metadata.currency, 'USD');
});

test('an existing payer is reengagement and a later ad never overwrites original acquisition', async () => {
  const { db, account, service } = await setup();
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, created_at) VALUES ('old', ?, 1000, 'topup', 'old', ?)`).bind(account.id, at - DAY).run();
  await service.seen(account, makeTouch());
  let fresh = (await accounts(db).byId(account.id))!;
  assert.equal(fresh.reddit_attribution, null);
  assert.ok(fresh.reddit_last_touch);
  const bob = (await accounts(db).byId('acct_bob'))!;
  await service.seen(bob, makeTouch('First'));
  await service.seen(bob, makeTouch('Second', at + 500));
  fresh = (await accounts(db).byId(bob.id))!;
  assert.equal(JSON.parse(fresh.reddit_attribution!).clickId, 'First');
  assert.equal(JSON.parse(fresh.reddit_last_touch!).clickId, 'Second');
});

test('reloads are distinct purchases and repeat deposits, never additional acquired customers', async () => {
  const { db, account, service } = await setup();
  await service.purchase(account, { transactionId: 'cs_1', cents: 1000, reload: false, from: makeTouch(), at: at + 500 });
  const fresh = (await accounts(db).byId(account.id))!;
  await service.purchase(fresh, { transactionId: 'in_2', cents: 2000, reload: true, at: at + 1000 });
  await service.purchase(fresh, { transactionId: 'in_2', cents: 2000, reload: true, at: at + 1000 });
  const rows = await events(db);
  assert.equal(rows.filter((e) => e.event_name === 'FirstPayment').length, 1);
  assert.equal(rows.filter((e) => e.event_name === 'PURCHASE').length, 2);
  assert.equal(rows.filter((e) => e.event_name === 'RepeatDeposit').length, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM reddit_payments').first<{ n: number }>())!.n, 2);
});

test('zero cash checkout does not create a first payer milestone', async () => {
  const { db, account, service } = await setup();
  await service.purchase(account, { transactionId: 'cs_free', cents: 0, reload: false, from: makeTouch(), at: at + 500 });
  assert.equal((await events(db)).filter((e) => e.event_name === 'FirstPayment').length, 0);
  await service.purchase(account, { transactionId: 'cs_paid', cents: 1000, reload: false, from: makeTouch(), at: at + 1000 });
  assert.equal((await events(db)).filter((e) => e.event_name === 'FirstPayment').length, 1);
});

test('inbound and unconnected calls do not activate; repeated same day calls do not mean return', async () => {
  const { db, account, service } = await setup();
  await service.seen(account, makeTouch());
  const fresh = (await accounts(db).byId(account.id))!;
  await connected(db, 'incoming', at + 500, 'inbound');
  await connected(db, 'empty', at + 600, 'outbound', 0);
  await service.callCompleted(fresh, 'incoming');
  await service.callCompleted(fresh, 'empty');
  await connected(db, 'first', at + 1000);
  await connected(db, 'same_day', at + 2000);
  await service.callCompleted(fresh, 'first');
  await service.callCompleted(fresh, 'same_day');
  assert.equal((await events(db)).filter((e) => e.event_name === 'ReturningCaller').length, 0);
  await connected(db, 'tomorrow', at + DAY);
  await service.callCompleted(fresh, 'tomorrow');
  assert.equal((await events(db)).filter((e) => e.event_name === 'ReturningCaller').length, 1);
});

test('internal accounts produce no conversion events or acquisition', async () => {
  const { db, account } = await setup();
  const service = redditAttribution({ DB: db, REDDIT_INTERNAL_EMAILS: account.email });
  await service.seen(account, makeTouch());
  await service.purchase(account, { transactionId: 'internal', cents: 1000, reload: false, from: makeTouch() });
  assert.deepEqual(await events(db), []);
  assert.equal((await accounts(db).byId(account.id))!.reddit_attribution, null);
});

test('outbox persists missing configuration, retries 429, and excludes acknowledged events', async () => {
  const { db, account, service } = await setup();
  await service.seen(account, makeTouch());
  assert.equal((await deliverReddit({ DB: db }, at + 1000)).pending, true);
  const original = globalThis.fetch;
  let status = 429, requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response('{}', { status }); }) as typeof fetch;
  try {
    const env = { DB: db, REDDIT_PIXEL_ID: 't2_test', REDDIT_CAPI_TOKEN: 'private' };
    await deliverReddit(env, Date.now() + 1000);
    assert.equal((await events(db))[0].state, 'pending');
    status = 200;
    await deliverReddit(env, Date.now() + 61_000);
    assert.equal((await events(db))[0].state, 'delivered');
    await deliverReddit(env, Date.now() + 120_000);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

test('reconciliation recovers a fulfilled discounted payment when background analytics never ran', async () => {
  const { db, account } = await setup();
  await db.prepare(`INSERT INTO topups (id, account_id, amount_cents, stripe_session_id, created_at, reddit_attribution)
    VALUES ('topup', ?, 3000, 'cs_recover', ?, ?)`).bind(account.id, at, JSON.stringify(makeTouch())).run();
  const stripe = { checkout: { sessions: { retrieve: async () => ({
    id: 'cs_recover', status: 'complete', payment_status: 'paid', amount_subtotal: 3000, amount_total: 1500, mode: 'payment', customer: null,
  }) } } } as unknown as Stripe;
  await topups(db, stripe).fulfill('cs_recover');
  assert.deepEqual(await events(db), []);
  await reconcileReddit({ DB: db, CANONICAL_HOST: 'call4.me' });
  await reconcileReddit({ DB: db, CANONICAL_HOST: 'call4.me' });
  const rows = await events(db);
  assert.equal(rows.filter((e) => e.event_name === 'PURCHASE').length, 1);
  assert.equal(JSON.parse(rows.find((e) => e.event_name === 'PURCHASE')!.payload).data.events[0].metadata.value, 15);
});

test('claiming a signed out purchase transfers attribution and its payment records', async () => {
  const { db, account, service } = await setup();
  await service.purchase(account, { transactionId: 'cs_claim', cents: 1000, reload: false, from: makeTouch() });
  const bob = (await accounts(db).byId('acct_bob'))!;
  const stripe = {} as Stripe;
  assert.equal(await topups(db, stripe).claim(account.id, bob), true);
  assert.ok((await accounts(db).byId(bob.id))!.reddit_attribution);
  assert.equal((await db.prepare('SELECT account_id FROM reddit_payments').first<{ account_id: string }>())!.account_id, bob.id);
  assert.equal((await db.prepare('SELECT account_id FROM reddit_visits').first<{ account_id: string }>())!.account_id, bob.id);
});

test('claiming into an existing payer retains transaction events and suppresses false signup and first payment', async () => {
  const { db, account, service } = await setup();
  await service.purchase(account, { transactionId: 'cs_claim', cents: 1000, reload: false, from: makeTouch(), at: at + 500 });
  const bob = (await accounts(db).byId('acct_bob'))!;
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, created_at)
    VALUES ('old', ?, 1000, 'topup', 'old', ?)`).bind(bob.id, at - DAY).run();
  assert.equal(await topups(db, {} as Stripe).claim(account.id, bob), true);
  const merged = (await accounts(db).byId(bob.id))!;
  assert.equal(merged.reddit_attribution, null);
  assert.ok(merged.reddit_last_touch);
  const rows = await events(db);
  assert.equal(rows.find((row) => row.event_name === 'SIGN_UP')!.state, 'failed');
  assert.equal(rows.find((row) => row.event_name === 'FirstPayment')!.state, 'failed');
  const purchase = rows.find((row) => row.event_name === 'PURCHASE')!;
  assert.equal(purchase.id, 'purchase:cs_claim');
  assert.equal(purchase.state, 'pending');
  assert.equal(JSON.parse(purchase.payload).data.events[0].user.external_id, createHash('sha256').update(bob.id).digest('hex'));
});

test('eligible account merges canonicalize milestone ids and retain the latest valid touch', async () => {
  const { db, account, service } = await setup();
  await service.purchase(account, { transactionId: 'cs_claim', cents: 1000, reload: false, from: makeTouch('First'), at: at + 500 });
  await service.seen((await accounts(db).byId(account.id))!, makeTouch('Newest', at + 1000));
  const bob = (await accounts(db).byId('acct_bob'))!;
  await db.prepare('UPDATE accounts SET reddit_last_touch = ? WHERE id = ?').bind(JSON.stringify(makeTouch('Older', at - 1000)), bob.id).run();
  const destination = (await accounts(db).byId(bob.id))!;
  assert.equal(await topups(db, {} as Stripe).claim(account.id, destination), true);
  const merged = (await accounts(db).byId(bob.id))!;
  assert.equal(JSON.parse(merged.reddit_attribution!).clickId, 'First');
  assert.equal(JSON.parse(merged.reddit_last_touch!).clickId, 'Newest');
  const first = (await events(db)).find((row) => row.event_name === 'FirstPayment')!;
  assert.equal(first.id, `first-payment:${bob.id}`);
  assert.equal(JSON.parse(first.payload).data.events[0].metadata.conversion_id, first.id);
  assert.equal(JSON.parse(first.payload).data.events[0].user.external_id, createHash('sha256').update(bob.id).digest('hex'));
});

test('canonical milestone conflicts preserve the target event and mark the source duplicate', async () => {
  const { db, account, service } = await setup();
  await service.purchase(account, { transactionId: 'cs_claim', cents: 1000, reload: false, from: makeTouch(), at: at + 500 });
  const bob = (await accounts(db).byId('acct_bob'))!;
  const targetPayload = JSON.stringify({ data: { events: [{ metadata: { conversion_id: `first-payment:${bob.id}` }, user: { external_id: 'original' } }] } });
  await db.prepare(`INSERT INTO reddit_events (id, account_id, event_name, payload, created_at, next_attempt_at, state)
    VALUES (?, ?, 'FirstPayment', ?, ?, ?, 'delivered')`).bind(`first-payment:${bob.id}`, bob.id, targetPayload, at, at).run();
  assert.equal(await topups(db, {} as Stripe).claim(account.id, bob), true);
  const rows = await events(db);
  assert.equal(rows.find((row) => row.id === `first-payment:${bob.id}`)!.payload, targetPayload);
  assert.equal(rows.find((row) => row.id === `first-payment:${account.id}`)!.state, 'failed');
  assert.equal(rows.filter((row) => row.event_name === 'FirstPayment' && row.state !== 'failed').length, 1);
});

test('internal merge destinations suppress pending events while sent audit payloads remain unchanged', async () => {
  const { db, account, service } = await setup();
  await service.purchase(account, { transactionId: 'cs_claim', cents: 1000, reload: false, from: makeTouch(), at: at + 500 });
  await db.prepare(`UPDATE reddit_events SET state = 'delivered' WHERE event_name = 'PURCHASE'`).run();
  const purchase = (await events(db)).find((row) => row.event_name === 'PURCHASE')!;
  const bob = (await accounts(db).byId('acct_bob'))!;
  assert.equal(await topups(db, {} as Stripe, { REDDIT_INTERNAL_EMAILS: ` ${bob.email.toUpperCase()} ` }).claim(account.id, bob), true);
  const merged = (await accounts(db).byId(bob.id))!;
  assert.equal(merged.reddit_attribution, null);
  assert.equal(merged.reddit_last_touch, null);
  const rows = await events(db);
  assert.ok(rows.filter((row) => row.id !== purchase.id).every((row) => row.state === 'failed'));
  assert.equal(rows.find((row) => row.id === purchase.id)!.state, 'delivered');
  assert.equal(rows.find((row) => row.id === purchase.id)!.payload, purchase.payload);
});
