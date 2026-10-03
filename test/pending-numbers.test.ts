import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';
import { checkDialable } from '../src/server/lib/phone';
import { accounts, type Account } from '../src/server/services/accounts';
import { mayCall, NumberError, numbers, RENEWAL_DAYS } from '../src/server/services/numbers';
import { d1 } from './sqlite-d1';

/**
 * Telnyx as buying a number needs it: one number for sale per country, approved paperwork, and
 * number orders whose status the test sets. An order abroad starts out pending, as Israel's do.
 */
const carrier = {
  forSale: { IL: '+972555074184', US: '+12025550142' } as Record<string, string>,
  orders: new Map<string, { number: string; status: string }>(),
  /** What a new order for a country comes back as. */
  initial: { IL: 'pending', US: 'success' } as Record<string, string>,
  released: [] as string[],
  failOrders: false,
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const path = decodeURIComponent(url.pathname.replace(/^\/v2/, ''));
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  const method = init?.method ?? 'GET';
  if (method === 'GET' && path.startsWith('/requirement_groups/')) return json(200, { data: { status: 'approved' } });
  if (method === 'GET' && path === '/available_phone_numbers') {
    const number = carrier.forSale[url.searchParams.get('filter[country_code]')!];
    return json(200, { data: number ? [{ phone_number: number, cost_information: { upfront_cost: '3.00000', monthly_cost: '3.60000', currency: 'USD' } }] : [] });
  }
  if (method === 'GET' && path.startsWith('/call_control_applications/')) return json(200, { data: { outbound: { outbound_voice_profile_id: 'ovp' } } });
  if (method === 'GET' && path === '/outbound_voice_profiles/ovp') return json(200, { data: { whitelisted_destinations: ['US', 'CA', 'IL'], max_destination_rate: null } });
  if (method === 'POST' && path === '/number_orders') {
    if (carrier.failOrders) return json(500, { errors: [{ detail: 'down' }] });
    const number = (body!.phone_numbers as { phone_number: string }[])[0].phone_number;
    const id = `order_${carrier.orders.size + 1}`;
    const country = Object.keys(carrier.forSale).find((c) => carrier.forSale[c] === number)!;
    carrier.orders.set(id, { number, status: carrier.initial[country] });
    return json(200, { data: { id, status: carrier.initial[country] } });
  }
  const order = /^\/number_orders\/(.+)$/.exec(path)?.[1];
  if (method === 'GET' && order) return json(200, { data: { status: carrier.orders.get(order)!.status } });
  if (method === 'GET' && path === '/phone_numbers') return json(200, { data: [{ id: 'pn', phone_number: url.searchParams.get('filter[phone_number]') }] });
  if (method === 'DELETE' && path === '/phone_numbers/pn') {
    carrier.released.push('released');
    return json(200, { data: {} });
  }
  throw new Error(`unexpected carrier request ${method} ${path}`);
}) as typeof fetch;

const alice = { id: 'acct_alice' } as Account;
const israel = checkDialable('+97235551234');
if (!israel.ok) throw new Error('test number');
let env: Env;

beforeEach(async () => {
  env = { DB: d1(), TELNYX_API_KEY: 'test', TELNYX_CONNECTION_ID: 'conn' } as unknown as Env;
  carrier.orders.clear();
  carrier.released.length = 0;
  carrier.failOrders = false;
  carrier.initial.IL = 'pending';
  await accounts(env.DB).post(alice.id, 1500, 'adjustment', 'seed', 'credits');
});

/** Run `p` while its order polling (1.5s apart) ticks by on mocked timers. */
async function polled<T>(p: Promise<T>): Promise<T> {
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  while (!done) {
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(1500);
  }
  return p;
}
mock.timers.enable({ apis: ['setTimeout'] });

const balance = () => accounts(env.DB).balanceCents(alice.id);

test('a number abroad still under the carrier\'s review stays paid for and pending, not refunded', async () => {
  const n = numbers(env);
  const bought = await polled(n.buy(alice, { country: 'IL' }));
  assert.equal(bought.number, undefined);
  assert.deepEqual([bought.pending!.e164, bought.pending!.country_name, bought.pending!.monthly], ['+972555074184', 'Israel', '$3.60']);
  assert.equal(await balance(), 1500 - 660);
  assert.equal(carrier.released.length, 0);
  // Pending: listed as waiting, not as a number to call from, and Israel can't be called yet.
  assert.deepEqual(await n.views(alice.id), []);
  assert.deepEqual((await n.pendingViews(alice.id)).map((v) => v.e164), ['+972555074184']);
  assert.equal(await mayCall(env.DB, alice.id, israel), false);
});

test('a second number in a country already waiting on the carrier is refused before anything is charged', async () => {
  const n = numbers(env);
  await polled(n.buy(alice, { country: 'IL' }));
  await assert.rejects(polled(n.buy(alice, { country: 'IL' })), (err: unknown) => err instanceof NumberError && err.status === 409 && /already paid for and waiting/.test(err.message));
  assert.equal(await balance(), 1500 - 660);
});

test('an approved order activates the number, and its first month starts then', async () => {
  const n = numbers(env);
  await polled(n.buy(alice, { country: 'IL' }));
  carrier.orders.get('order_1')!.status = 'success';
  const at = Date.parse('2026-10-05T12:00:00Z');
  assert.deepEqual(await n.settlePending(at), { activated: 1, failed: 0, waiting: 0 });
  const [active] = await n.views(alice.id);
  assert.equal(active.e164, '+972555074184');
  assert.equal(active.renews, new Date(at + RENEWAL_DAYS * 86_400_000).toISOString().slice(0, 10));
  assert.deepEqual(await n.pendingViews(alice.id), []);
  assert.equal(await mayCall(env.DB, alice.id, israel), true);
  assert.equal(await balance(), 1500 - 660);
});

test('the account page sees an approval the cron hasn\'t picked up yet', async () => {
  const n = numbers(env);
  await polled(n.buy(alice, { country: 'IL' }));
  carrier.orders.get('order_1')!.status = 'success';
  assert.deepEqual(await n.pendingViews(alice.id), []);
  assert.deepEqual((await n.views(alice.id)).map((v) => v.e164), ['+972555074184']);
});

test('an order the carrier turns down after review is refunded in full and the number given back', async () => {
  const n = numbers(env);
  await polled(n.buy(alice, { country: 'IL' }));
  carrier.orders.get('order_1')!.status = 'deleted';
  assert.deepEqual(await n.settlePending(), { activated: 0, failed: 1, waiting: 0 });
  assert.equal(await balance(), 1500);
  assert.equal(carrier.released.length, 1);
  assert.deepEqual(await n.pendingViews(alice.id), []);
  // Settling again neither refunds twice nor touches it.
  assert.deepEqual(await n.settlePending(), { activated: 0, failed: 0, waiting: 0 });
  assert.equal(await balance(), 1500);
});

test('an order still under review keeps waiting', async () => {
  const n = numbers(env);
  await polled(n.buy(alice, { country: 'IL' }));
  assert.deepEqual(await n.settlePending(), { activated: 0, failed: 0, waiting: 1 });
  assert.equal(await balance(), 1500 - 660);
});

test('a pending number cannot be released yet', async () => {
  const n = numbers(env);
  await polled(n.buy(alice, { country: 'IL' }));
  await assert.rejects(n.release(alice, '+972555074184'), (err: unknown) => err instanceof NumberError && err.status === 409 && /still waiting on the carrier/.test(err.message));
});

test('an order completed while buying is active right away, as US orders are', async () => {
  const bought = await polled(numbers(env).buy(alice, { country: 'US' }));
  assert.equal(bought.pending, undefined);
  assert.equal(bought.number!.e164, '+12025550142');
  assert.equal(await balance(), 1500 - 660);
});

test('an order refused on the spot is refunded and nothing is held', async () => {
  carrier.initial.IL = 'failure';
  await assert.rejects(polled(numbers(env).buy(alice, { country: 'IL' })), (err: unknown) => err instanceof NumberError && err.status === 502 && /turned down/.test(err.message));
  assert.equal(await balance(), 1500);
  assert.deepEqual(await numbers(env).pendingViews(alice.id), []);
});

test('a carrier error placing the order is refunded', async () => {
  carrier.failOrders = true;
  await assert.rejects(polled(numbers(env).buy(alice, { country: 'IL' })), (err: unknown) => err instanceof NumberError && err.status === 502);
  assert.equal(await balance(), 1500);
});
