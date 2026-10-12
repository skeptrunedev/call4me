import assert from 'node:assert/strict';
import test from 'node:test';
import { accounts, type Account } from '../src/server/services/accounts';
import { CallError, calls, type Brief } from '../src/server/services/calls';
import { d1 } from './sqlite-d1';

const alice = { id: 'acct_alice', email: 'alice@example.com', display_name: 'Alice' } as Account;
const input = {
  to: '+1 503 266 1156', business: 'Canby Utility', category: 'general',
  goal: 'Ask when the office opens.', details: { questions: 'What are your opening hours?' },
};

async function setup(balance: number) {
  const db = d1();
  await accounts(db).post(alice.id, balance, 'topup', 'test:credits');
  return db;
}

test('omitting the limit reserves 30 minutes and leaves credits for a second call', async () => {
  const db = await setup(2000);
  const service = calls(db);
  const first = (await service.create(alice, input, 25)).call;
  assert.equal((JSON.parse(first.brief) as Brief).max_minutes, 30);
  assert.equal(first.hold_cents, 750);
  assert.equal(await accounts(db).balanceCents(alice.id), 1250);
  const second = (await service.create(alice, input, 25)).call;
  assert.equal(second.hold_cents, 750);
  assert.equal(await accounts(db).balanceCents(alice.id), 500);
});

test('a default limit fits the available whole minutes at the destination rate', async () => {
  const db = await setup(399);
  const { call } = await calls(db).create(alice, input, 40);
  assert.equal((JSON.parse(call.brief) as Brief).max_minutes, 9);
  assert.equal(call.hold_cents, 360);
  assert.equal(await accounts(db).balanceCents(alice.id), 39);
});

for (const [requested, expected] of [[5, 5], [90, 90], [240, 240], [300, 240]]) {
  test(`an explicit ${requested} minute cap reserves ${expected} minutes`, async () => {
    const db = await setup(10000);
    const { call } = await calls(db).create(alice, { ...input, max_minutes: requested }, 25);
    assert.equal((JSON.parse(call.brief) as Brief).max_minutes, expected);
    assert.equal(call.hold_cents, expected * 25);
  });
}

test('an explicit longer cap still cannot reserve more than the balance covers', async () => {
  const db = await setup(1010);
  const { call } = await calls(db).create(alice, { ...input, max_minutes: 90 }, 25);
  assert.equal((JSON.parse(call.brief) as Brief).max_minutes, 40);
  assert.equal(call.hold_cents, 1000);
});

test('less than one minute of credits refuses a call without recording a hold', async () => {
  const db = await setup(24);
  await assert.rejects(calls(db).create(alice, input, 25), (err: unknown) => err instanceof CallError && err.status === 402);
  assert.equal(await accounts(db).balanceCents(alice.id), 24);
  assert.deepEqual(await calls(db).list(alice.id), []);
});
