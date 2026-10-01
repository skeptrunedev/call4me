import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDialable } from '../src/server/lib/phone';
import { calls } from '../src/server/services/calls';
import { callPrice, pricePerMinute, pricePerMinuteTo } from '../src/server/services/dialer';
import { CALLABLE, mayCall } from '../src/server/services/numbers';

const env = { PRICE_PER_MINUTE_CENTS: '25' } as unknown as Env;
const dubai = '+971 4 224 5555';

// An account that holds no numbers at all.
const noNumbers = { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as unknown as D1Database;

test('an account calls UAE businesses from its US number, without a UAE number', async () => {
  const to = checkDialable(dubai);
  assert.ok(to.ok && to.country === 'AE' && !to.home);
  assert.equal(await mayCall(noNumbers, 'acct_test', to), true);
});

test('an account calls Japanese businesses from its US number too', async () => {
  const to = checkDialable('+81 3 1234 5678');
  assert.ok(to.ok && to.country === 'JP' && !to.home);
  assert.equal(await mayCall(noNumbers, 'acct_test', to), true);
  assert.ok(CALLABLE.includes('JP'));
  assert.equal(pricePerMinuteTo(env, '+81 90 1234 5678'), 40);
});

test('countries outside the US, Canada, Europe, the UAE and Japan still need a number there', async () => {
  const to = checkDialable('+52 55 1234 5678');
  assert.ok(to.ok && to.country === 'MX');
  assert.equal(await mayCall(noNumbers, 'acct_test', to), false);
});

test('the carrier whitelist sync includes the UAE', () => {
  assert.ok(CALLABLE.includes('AE'));
});

test('UAE calls are priced at 40 cents a minute; everywhere else keeps the standard price', () => {
  assert.equal(pricePerMinuteTo(env, dubai), 40);
  assert.equal(pricePerMinuteTo(env, '00971 50 123 4567'), 40);
  assert.equal(pricePerMinuteTo(env, '+1 415 555 0123'), pricePerMinute(env));
  assert.equal(pricePerMinuteTo(env, '+44 20 7946 0958'), pricePerMinute(env));
  // A callback coming in from the UAE is answered on our US number, at the standard price.
  assert.equal(callPrice(env, { direction: 'outbound', to_number: '+97142245555' }), 40);
  assert.equal(callPrice(env, { direction: 'inbound', to_number: '+97142245555' }), pricePerMinute(env));
});

test('a finished UAE call releases its hold and is billed 40 cents per started minute', async () => {
  const row = { id: 'call_uae', account_id: 'acct_test', direction: 'outbound', to_number: '+97142245555', business: 'Dubai Mall', status: 'in_progress', answered_at: 1_000, hold_cents: 400 };
  const ledger: { amount: number; kind: string }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => (sql.startsWith('SELECT * FROM calls') ? row : null),
        run: async () => {
          if (sql.includes('INSERT') && sql.includes('ledger')) ledger.push({ amount: args[2] as number, kind: args[3] as string });
          return { meta: { changes: 1 } };
        },
      }),
    }),
  } as unknown as D1Database;
  // 2 min 30 s of talk time: 3 started minutes.
  await calls(db).finish(row.id, { status: 'completed', pricePerMinuteCents: callPrice(env, row), at: 1_000 + 150_000 });
  assert.deepEqual(
    ledger.map((l) => [l.kind, l.amount]),
    [
      ['release', 400],
      ['call', -120],
    ],
  );
});
