import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account } from '../src/server/services/accounts';
import { CallError, calls } from '../src/server/services/calls';
import { d1 } from './sqlite-d1';

const alice = { id: 'acct_alice', email: 'alice@example.com', display_name: 'Alice', zdr: 0 } as Account;
const input = (to: string) => ({ to, business: 'A shop', category: 'general', goal: 'Ask when they open.', details: { questions: 'What are your opening hours?' } });
const refused = (message: RegExp) => (err: unknown) => err instanceof CallError && err.status === 422 && message.test(err.message);

test('calling a country call4me sells numbers in asks the agent to buy one', async () => {
  await assert.rejects(calls(d1()).validate(alice, input('+972 3 761 0000')), refused(/^calling IL numbers needs a number in IL: .*call4me_buy_number/));
});

test('calling a country call4me never calls says so, without sending the agent to buy a number', async () => {
  await assert.rejects(calls(d1()).validate(alice, input('+375 17 327 0000')), refused(/^call4me doesn't place calls to BY numbers$/));
});
