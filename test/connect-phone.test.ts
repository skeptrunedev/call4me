import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account } from '../src/server/services/accounts';
import { CallError, calls, type PlaceCallInput } from '../src/server/services/calls';
import { d1 } from './sqlite-d1';

const alice = { id: 'acct_alice', email: 'alice@example.com', display_name: 'Alice', key_prefix: null, created_at: 0 } as unknown as Account;
const call: PlaceCallInput = { to: '+1 415 555 0123', business: 'Rosa', category: 'general', goal: 'Ask their hours', details: { questions: 'What are your hours?' } };

async function setup(profile: Record<string, string>) {
  const db = d1();
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES ('l1', 'acct_alice', 1000, 'topup', 'test:topup', 'card', 0)`).run();
  await db.prepare(`INSERT INTO profiles (account_id, fields, updated_at) VALUES ('acct_alice', ?, 0)`).bind(JSON.stringify(profile)).run();
  return db;
}

test('connecting the user with no phone to ring them is refused before any hold or credits are taken', async () => {
  const db = await setup({ full_name: 'Alice Smith' });
  for (const ask of [{ connect_when: 'as soon as a person picks up' }, { listen_in: true }]) {
    await assert.rejects(
      calls(db).create(alice, { ...call, ...ask }, 25),
      (e) => e instanceof CallError && e.status === 422 && /details\.phone/.test(e.message),
    );
  }
  assert.equal((await db.prepare(`SELECT count(*) AS n FROM calls`).first<{ n: number }>())!.n, 0);
  assert.equal((await db.prepare(`SELECT SUM(amount_cents) AS b FROM ledger`).first<{ b: number }>())!.b, 1000);
});

test('the phone given for the call is the one rung, ahead of the profile', async () => {
  const db = await setup({ full_name: 'Alice Smith', phone: '(925) 555-0100' });
  const { ownerPhone } = await calls(db).create(alice, { ...call, connect_when: 'as soon as a person picks up', details: { ...call.details, phone: '973 555 0136' } }, 25);
  assert.equal(ownerPhone, '+19735550136');
});

test('a call for someone else rings the owner from their profile, never the phone given for that person', async () => {
  const db = await setup({ full_name: 'Alice Smith', phone: '(925) 555-0100' });
  const { ownerPhone } = await calls(db).create(alice, { ...call, on_behalf_of: 'Bob Jones', connect_when: 'as soon as a person picks up', details: { ...call.details, phone: '973 555 0136' } }, 25);
  assert.equal(ownerPhone, '+19255550100');
});

test('a call that never connects the user needs no phone', async () => {
  const db = await setup({ full_name: 'Alice Smith' });
  const { ownerPhone } = await calls(db).create(alice, call, 25);
  assert.equal(ownerPhone, null);
});
