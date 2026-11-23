import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/server/lib/context';
import { mcpAtRestApi } from '../src/server/routes/mcp';
import { callRoutes } from '../src/server/routes/calls';
import { d1 } from './sqlite-d1';

// A claude.ai connector set up with https://call4.me/api/calls sent its MCP handshake there for
// over an hour (Nov 22, 2026) and was only ever told that to, business and goal were missing.
function setup(t: TestContext) {
  const app = new Hono<AppEnv>();
  app.use('/api/*', mcpAtRestApi);
  app.route('/', callRoutes);
  app.post('/api/auth/sign-in', async (c) => c.json(await c.req.json()));
  t.mock.method(console, 'log', () => {});
  return (path: string, body: unknown) =>
    app.request(`https://call4.me${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, { DB: d1() } as Env);
}

const initialize = { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '0.1.0' } } };

test('an MCP handshake sent to the REST API is told, in JSON-RPC, where the MCP server is', async (t) => {
  const post = setup(t);
  for (const body of [initialize, [initialize]]) {
    const res = await post('/api/calls', body);
    assert.equal(res.status, 400);
    const reply = (await res.json()) as { jsonrpc: string; id: unknown; error: { code: number; message: string } };
    assert.equal(reply.jsonrpc, '2.0');
    assert.equal(reply.id, Array.isArray(body) ? null : 0);
    assert.equal(reply.error.message, "/api/calls is call4me's REST API, not its MCP server: connect your MCP client to https://call4.me/mcp");
  }
});

test('REST requests and sign-in pass through untouched', async (t) => {
  const post = setup(t);
  assert.equal((await post('/api/calls', { to: '+14155550123', business: 'Nopa', goal: 'Book a table', category: 'restaurant' })).status, 401);
  const res = await post('/api/auth/sign-in', initialize);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), initialize);
});
