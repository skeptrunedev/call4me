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

const { createCall4meServer, currentToolName, withCurrentToolNames } = await import('../src/server/mcp/server');

// Neither tools/list nor call4me_get_requirements without a category touches the database.
const account = { id: 'acct_test', email: 'test@example.com' } as Account;
const handler = createMcpHandler(() => createCall4meServer({ env: {} as Env, origin: 'https://call4.me', account, stripe: () => { throw new Error('no stripe in tests'); } }), { legacy: 'stateless' });

async function rpc(method: string, params: Record<string, unknown> = {}): Promise<{ result?: Record<string, unknown>; error?: { message: string } }> {
  const req = new Request('https://call4.me/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const res = await handler.fetch(await withCurrentToolNames(req));
  const text = await res.text();
  // Streamable HTTP may answer as SSE: the JSON-RPC message is the data line.
  const json = text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data: '))!.slice(6);
  return JSON.parse(json) as { result?: Record<string, unknown>; error?: { message: string } };
}

test('legacy callbay_ names map to call4me_ and everything else is left alone', () => {
  assert.equal(currentToolName('callbay_place_call'), 'call4me_place_call');
  assert.equal(currentToolName('call4me_place_call'), 'call4me_place_call');
  assert.equal(currentToolName('something_else'), 'something_else');
});

test('tools/list shows only call4me_ tools', async () => {
  const { result } = await rpc('tools/list');
  const names = (result!.tools as { name: string }[]).map((t) => t.name);
  assert.ok(names.includes('call4me_place_call') && names.includes('call4me_hang_up'));
  assert.deepEqual(names.filter((n) => !n.startsWith('call4me_')), []);
});

test('a saved callbay_ tool name still works', async () => {
  const { result, error } = await rpc('tools/call', { name: 'callbay_get_requirements', arguments: {} });
  assert.equal(error, undefined);
  assert.notEqual(result!.isError, true);
  assert.match(JSON.stringify(result!.content), /restaurant/i);
});

test('requests that are not a tools/call pass through untouched', async () => {
  const req = new Request('https://call4.me/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(await withCurrentToolNames(req), req);
});
