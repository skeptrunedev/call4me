import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Account } from '../src/server/services/accounts';

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
const { catalog } = await import('../src/server/services/intake');

const account = { id: 'acct_test', email: 'test@example.com' } as Account;

async function rpc(surface: 'agents' | 'chatgpt', method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const handler = createMcpHandler(() => createCall4meServer({ env: {} as Env, origin: 'https://call4.me', account, stripe: () => { throw new Error('no stripe in tests'); }, surface }), { legacy: 'stateless' });
  const res = await handler.fetch(
    new Request('https://call4.me/chatgpt/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
  const text = await res.text();
  const json = text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data: '))!.slice(6);
  return (JSON.parse(json) as { result: Record<string, unknown> }).result;
}

type Tool = { name: string; annotations?: Record<string, boolean>; inputSchema: { properties?: Record<string, { enum?: string[] }> } };
const tools = async (surface: 'agents' | 'chatgpt') => (await rpc(surface, 'tools/list')).tools as Tool[];

test('the ChatGPT server sells nothing: no credit or number purchase tools', async () => {
  const names = (await tools('chatgpt')).map((t) => t.name);
  for (const name of ['call4me_add_funds', 'call4me_buy_number', 'call4me_list_numbers', 'call4me_release_number']) assert.ok(!names.includes(name), name);
  assert.ok(names.includes('call4me_place_call') && names.includes('call4me_get_balance'));
  const all = (await tools('agents')).map((t) => t.name);
  assert.ok(all.includes('call4me_add_funds') && all.includes('call4me_buy_number'));
});

test('the ChatGPT server never asks for health, government-ID or account-secret data', async () => {
  const list = await tools('chatgpt');
  const place = list.find((t) => t.name === 'call4me_place_call')!;
  const slugs = place.inputSchema.properties!.category.enum!;
  for (const slug of ['medical', 'dental', 'internet_existing_account']) assert.ok(!slugs.includes(slug), slug);
  assert.ok(slugs.includes('restaurant') && slugs.includes('flight_change'));
  const profileKeys = Object.keys(list.find((t) => t.name === 'call4me_save_profile')!.inputSchema.properties!);
  for (const key of ['insurance_member_id', 'dental_insurance_member_id', 'known_traveler_number', 'redress_number']) assert.ok(!profileKeys.includes(key), key);
  const fields = catalog('chatgpt').categories.flatMap((c) => c.fields);
  assert.deepEqual(fields.filter((f) => f.sensitive || ['insurance_carrier', 'known_traveler_number', 'redress_number'].includes(f.profile ?? '')), []);
  const result = await rpc('chatgpt', 'tools/call', { name: 'call4me_get_requirements', arguments: {} });
  assert.doesNotMatch(JSON.stringify(result.content), /medical|dental/i);
});

test('placing a call is marked irreversible on every surface', async () => {
  for (const surface of ['agents', 'chatgpt'] as const) {
    const place = (await tools(surface)).find((t) => t.name === 'call4me_place_call')!;
    assert.equal(place.annotations?.destructiveHint, true);
    assert.equal(place.annotations?.openWorldHint, true);
  }
});

test('every tool states each hint explicitly', async () => {
  for (const tool of await tools('chatgpt')) {
    for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof tool.annotations?.[hint], 'boolean', `${tool.name} ${hint}`);
  }
});
