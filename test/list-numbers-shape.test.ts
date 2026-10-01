import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Account } from '../src/server/services/accounts';
import { d1 } from './sqlite-d1';

// The server imports the voice session, whose base class only exists on Workers.
const workerModule = `export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent(workerModule)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { createCall4meServer } = await import('../src/server/mcp/server');

// MCP clients cache a tool's outputSchema and reject structured content with keys it doesn't
// list. These are the keys call4me_list_numbers returned before own numbers existed.
const OLD_OUTPUT = ['countries', 'numbers'];
const OLD_NUMBER = ['country', 'country_name', 'e164', 'included', 'monthly', 'monthly_cents', 'number', 'overdue', 'release_after', 'renews', 'type'];
const OLD_COUNTRY = ['available', 'country', 'monthly', 'monthly_cents', 'name', 'price', 'reason', 'type', 'upfront_cents'];

const db = d1();
await db.prepare(`INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, status, created_at) VALUES ('n1', 'acct_alice', '+12025550111', 'US', 'local', 1, 0, 'active', 0)`).run();
await db.prepare(`INSERT INTO number_offers (country, available, reason, upfront_cents, monthly_cents, checked_at) VALUES ('GB', 1, NULL, 100, 100, 0)`).run();
const handler = (account: Account) =>
  createMcpHandler(() => createCall4meServer({ env: { DB: db } as unknown as Env, origin: 'https://call4.me', account, stripe: () => { throw new Error('no stripe in tests'); } }), { legacy: 'stateless' });

async function rpc(account: Account, method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await handler(account).fetch(
    new Request('https://call4.me/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
  const text = await res.text();
  const json = text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data: '))!.slice(6);
  return (JSON.parse(json) as { result: Record<string, unknown> }).result;
}

const keys = (o: object) => Object.keys(o).sort();

test('an account without own numbers gets exactly the list_numbers shape cached clients know', async () => {
  const result = await rpc({ id: 'acct_alice', email: 'alice@example.com' } as Account, 'tools/call', { name: 'call4me_list_numbers', arguments: {} });
  assert.notEqual(result.isError, true);
  const out = result.structuredContent as { numbers: object[]; countries: object[] };
  assert.deepEqual(keys(out), OLD_OUTPUT);
  assert.equal(out.numbers.length, 1);
  for (const n of out.numbers) assert.deepEqual(keys(n), OLD_NUMBER);
  assert.ok(out.countries.length > 0);
  for (const c of out.countries) assert.deepEqual(keys(c), OLD_COUNTRY);
});

test('own numbers show up in list_numbers once the account has one', async () => {
  await db.prepare(`INSERT INTO verified_numbers (id, account_id, phone_number, country, method, status, created_at, verified_at) VALUES ('v1', 'acct_bob', '+12025550123', 'US', 'sms', 'verified', 0, 0)`).run();
  const result = await rpc({ id: 'acct_bob', email: 'bob@example.com' } as Account, 'tools/call', { name: 'call4me_list_numbers', arguments: {} });
  const out = result.structuredContent as { own_numbers: { e164: string; status: string }[] };
  assert.deepEqual(out.own_numbers.map((n) => [n.e164, n.status]), [['+12025550123', 'verified']]);
});

test('declared output schemas accept keys added later', async () => {
  const { tools } = (await rpc({ id: 'acct_alice' } as Account, 'tools/list')) as { tools: { name: string; outputSchema?: unknown }[] };
  const strict: string[] = [];
  const walk = (path: string, s: unknown) => {
    if (!s || typeof s !== 'object') return;
    const o = s as Record<string, unknown>;
    if (o.type === 'object' && o.additionalProperties === false) strict.push(path);
    for (const [k, v] of Object.entries(o)) walk(`${path}.${k}`, v);
  };
  const declared = tools.filter((t) => t.outputSchema);
  assert.ok(declared.some((t) => t.name === 'call4me_list_numbers') && declared.some((t) => t.name === 'call4me_get_recordings'));
  for (const t of declared) walk(t.name, t.outputSchema);
  assert.deepEqual(strict, []);
});
