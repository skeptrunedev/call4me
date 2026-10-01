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

// Just enough D1 for checkout: no saved Stripe customer, and the topup insert.
const inserts: unknown[][] = [];
const db = {
  prepare: () => ({
    bind: (...args: unknown[]) => ({
      first: async () => null,
      run: async () => {
        inserts.push(args);
        return { meta: { changes: 1 } };
      },
    }),
  }),
};
const sessions: Record<string, unknown>[] = [];
const stripe = { checkout: { sessions: { create: async (params: Record<string, unknown>) => (sessions.push(params), { id: 'cs_test', url: 'https://checkout.stripe.com/c/cs_test' }) } } };

const account = { id: 'acct_test', email: 'test@example.com' } as Account;
const handler = createMcpHandler(() => createCall4meServer({ env: { DB: db } as unknown as Env, origin: 'https://call4.me', account, stripe: () => stripe as never }), { legacy: 'stateless' });

async function rpc(method: string, params: Record<string, unknown> = {}): Promise<{ result?: Record<string, unknown>; error?: { message: string } }> {
  const res = await handler.fetch(
    new Request('https://call4.me/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
  const text = await res.text();
  const json = text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data: '))!.slice(6);
  return JSON.parse(json) as { result?: Record<string, unknown>; error?: { message: string } };
}

test('agents cannot stop the monthly reload, and add_funds has no one-time option', async () => {
  const { result } = await rpc('tools/list');
  const tools = result!.tools as { name: string; inputSchema: { properties?: Record<string, unknown> } }[];
  assert.equal(tools.find((t) => t.name === 'call4me_stop_reload'), undefined);
  const addFunds = tools.find((t) => t.name === 'call4me_add_funds')!;
  assert.deepEqual(Object.keys(addFunds.inputSchema.properties ?? {}), ['amount_dollars']);
});

test('add_funds always opens a monthly checkout, even if asked for a one-time load', async () => {
  const { result } = await rpc('tools/call', { name: 'call4me_add_funds', arguments: { amount_dollars: 20, monthly: false } });
  assert.notEqual(result!.isError, true);
  assert.equal(sessions.at(-1)!.mode, 'subscription');
  // topups row: (id, account_id, email, amount_cents, monthly, ...)
  assert.equal(inserts.at(-1)![4], 1);
  assert.match(JSON.stringify(result!.content), /reloads monthly/);
});
