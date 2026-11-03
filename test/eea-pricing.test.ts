import assert from 'node:assert/strict';
import test from 'node:test';
import { pricePerMinuteTo } from '../src/server/services/dialer';

const env = { PRICE_PER_MINUTE_CENTS: '25' } as Env;
const greekMobile = '+30 694 432 8469';

test('a Greek mobile is the Greece price from a US caller ID', () => {
  assert.equal(pricePerMinuteTo(env, greekMobile, '+1 573 285 1172'), 75);
  assert.equal(pricePerMinuteTo(env, greekMobile), 75);
});

test('from an EEA number the carrier charges the local rate, so it is the standard price', () => {
  assert.equal(pricePerMinuteTo(env, greekMobile, '+31 6 12345678'), 25);
});

test('a UK number is outside the EEA and keeps the Greece price', () => {
  assert.equal(pricePerMinuteTo(env, greekMobile, '+44 20 7946 0958'), 75);
});

test('destinations outside the EEA keep their price whatever the caller ID', () => {
  assert.equal(pricePerMinuteTo(env, '+81 3 1234 5678', '+31 6 12345678'), 40);
});
