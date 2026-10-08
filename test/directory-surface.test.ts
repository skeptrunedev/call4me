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

async function rpc(surface: 'agents' | 'chatgpt' | 'claude', method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
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

type Tool = { name: string; description?: string; annotations?: Record<string, boolean | string>; _meta?: Record<string, unknown>; inputSchema: { properties?: Record<string, { enum?: string[] }> } };
const tools = async (surface: 'agents' | 'chatgpt' | 'claude') => (await rpc(surface, 'tools/list')).tools as Tool[];

test('the directory servers sell nothing: no credit or number purchase tools', async () => {
  for (const surface of ['chatgpt', 'claude'] as const) {
    const names = (await tools(surface)).map((t) => t.name);
    for (const name of ['call4me_add_funds', 'call4me_buy_number', 'call4me_list_numbers', 'call4me_release_number']) assert.ok(!names.includes(name), `${surface} ${name}`);
    assert.ok(names.includes('call4me_place_call') && names.includes('call4me_get_balance'));
  }
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

test('every tool advertises its OAuth policy in the serialized discovery response', async () => {
  for (const surface of ['agents', 'chatgpt', 'claude'] as const) {
    for (const tool of await tools(surface)) {
      assert.deepEqual(tool._meta?.securitySchemes, [{ type: 'oauth2', scopes: ['calls'] }], `${surface} ${tool.name}`);
    }
  }
});

test('relaying an answer to the business is open-world, and saving the profile can remove fields', async () => {
  const list = await tools('chatgpt');
  assert.equal(list.find((t) => t.name === 'call4me_answer_question')!.annotations?.openWorldHint, true);
  assert.equal(list.find((t) => t.name === 'call4me_save_profile')!.annotations?.destructiveHint, true);
});

test('the ChatGPT instructions ask only for what a call needs', async () => {
  const handler = (await import('@modelcontextprotocol/server')).createMcpHandler(() => createCall4meServer({ env: {} as Env, origin: 'https://call4.me', account, stripe: () => { throw new Error('no stripe'); }, surface: 'chatgpt' }), { legacy: 'stateless' });
  const res = await handler.fetch(new Request('https://call4.me/chatgpt/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) }));
  const text = await res.text();
  const json = JSON.parse(text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data: '))!.slice(6)) as { result: { instructions: string } };
  assert.doesNotMatch(json.result.instructions, /date of birth|insurance|home address/i);
  assert.doesNotMatch(json.result.instructions, /\bVIN\b/);
});

test('every directory server is its own OAuth resource with its own metadata', async () => {
  const { DIRECTORY_SERVERS, mcpResourceAt } = await import('../src/server/lib/auth-options');
  const { directoryMcpProtectedResource } = await import('../src/server/lib/discovery');
  assert.deepEqual(DIRECTORY_SERVERS.map((s) => s.path), ['/chatgpt/mcp', '/claude/mcp']);
  for (const s of DIRECTORY_SERVERS) {
    const meta = directoryMcpProtectedResource('https://call4.me', s);
    assert.equal(meta.resource, mcpResourceAt(s.path, 'https://call4.me'));
    assert.equal(meta.resource_name, `call4me for ${s.host}`);
  }
});

test('every tool carries its title in annotations too, for the Claude directory', async () => {
  for (const surface of ['agents', 'chatgpt'] as const) {
    for (const tool of await tools(surface)) assert.equal(typeof tool.annotations?.title, 'string', `${surface} ${tool.name} has no annotations.title`);
  }
});

test('directory tool descriptions only mention tools the directory server has', async () => {
  for (const surface of ['chatgpt', 'claude'] as const) {
    const list = await tools(surface);
    const names = new Set(list.map((t) => t.name));
    for (const tool of list) {
      for (const mentioned of tool.description?.match(/call4me_[a-z_]+/g) ?? []) assert.ok(names.has(mentioned), `${surface} ${tool.name} mentions ${mentioned}`);
    }
  }
});

test('the Claude server books doctor and dentist appointments, with the insurance fields', async () => {
  const place = (await tools('claude')).find((t) => t.name === 'call4me_place_call')!;
  const slugs = place.inputSchema.properties!.category.enum!;
  for (const slug of ['medical', 'dental']) assert.ok(slugs.includes(slug), slug);
  const profileKeys = Object.keys((await tools('claude')).find((t) => t.name === 'call4me_save_profile')!.inputSchema.properties!);
  assert.ok(profileKeys.includes('insurance_member_id'));
});
