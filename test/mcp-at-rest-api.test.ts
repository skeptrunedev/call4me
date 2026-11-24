import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/server/lib/context';
import { sha256Hex } from '../src/server/lib/keys';
import { mcpAtRestApi } from '../src/server/routes/mcp';
import { callRoutes } from '../src/server/routes/calls';
import { d1 } from './sqlite-d1';

// A claude.ai connector set up with https://call4.me/api/calls signed in, then failed every MCP
// handshake for days (Nov 22-24, 2026): claude.ai showed its user a failed connection, never the
// error naming /mcp. /api/calls is an MCP server too now, so such a connector just works.
const KEY = `cb_live_${'a'.repeat(32)}`;
const MCP_ACCEPT = 'application/json, text/event-stream';

async function setup(t: TestContext) {
  const db = d1();
  await db.prepare(`UPDATE accounts SET key_hash = ? WHERE id = 'acct_alice'`).bind(await sha256Hex(KEY)).run();
  const app = new Hono<AppEnv>();
  app.use('/api/*', mcpAtRestApi);
  app.route('/', callRoutes);
  app.post('/api/auth/sign-in', async (c) => c.json(await c.req.json()));
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: unknown) => lines.push(String(line)));
  t.mock.method(console, 'warn', () => {});
  // Every real request names its host, which the MCP server's DNS-rebinding guard checks.
  const request = (path: string, init: RequestInit = {}) =>
    app.request(`https://call4.me${path}`, { ...init, headers: { host: 'call4.me', ...(init.headers as Record<string, string>) } }, { DB: db, CANONICAL_HOST: 'call4.me' } as Env);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: MCP_ACCEPT, ...headers }, body: JSON.stringify(body) });
  return { request, post, lines };
}

const initialize = { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '0.1.0' } } };

/** A JSON-RPC result, from a JSON body or the first event of a stream. */
async function result(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  const json = text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data: '))!.slice(6);
  return (JSON.parse(json) as { result: Record<string, unknown> }).result;
}

test('an MCP handshake at /api/calls without a credential is sent to sign in through the site', async (t) => {
  const { post } = await setup(t);
  const res = await post('/api/calls', initialize);
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer resource_metadata="https:\/\/call4\.me\/\.well-known\/oauth-protected-resource"$/);
  const reply = (await res.json()) as { jsonrpc: string; error: { message: string } };
  assert.equal(reply.jsonrpc, '2.0');
  assert.equal(reply.error.message, 'sign in to call4me to use this server');
  const bad = await post('/api/calls', initialize, { authorization: 'Bearer cb_live_nope' });
  assert.equal(bad.status, 401);
  assert.match(bad.headers.get('www-authenticate') ?? '', /error="invalid_token"/);
});

test('with a credential, /api/calls answers MCP like /mcp', async (t) => {
  const { post, lines } = await setup(t);
  const auth = { authorization: `Bearer ${KEY}` };
  const init = await post('/api/calls', initialize, auth);
  assert.equal(init.status, 200);
  assert.equal(((await result(init)).serverInfo as { name: string }).name, 'call4me');
  const list = await post('/api/calls', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, { ...auth, 'mcp-protocol-version': '2025-06-18' });
  const names = ((await result(list)).tools as { name: string }[]).map((tool) => tool.name);
  assert.ok(names.includes('call4me_place_call') && names.includes('call4me_get_balance'));
  assert.ok(lines.includes('mcp at /api/calls account=acct_alice'));
});

test("an MCP client's stream GET at /api/calls goes to the MCP server, not the REST call list", async (t) => {
  const { request } = await setup(t);
  const res = await request('/api/calls', { headers: { authorization: `Bearer ${KEY}`, accept: 'text/event-stream' } });
  // The stateless server opens no stream, as at /mcp: a JSON-RPC 405 the client reads as "none here".
  assert.equal(res.status, 405);
  const reply = (await res.json()) as { jsonrpc: string; calls?: unknown };
  assert.equal(reply.jsonrpc, '2.0');
  assert.equal(reply.calls, undefined);
});

test('an MCP message at any other REST route is told, in JSON-RPC, where the MCP server is', async (t) => {
  const { post } = await setup(t);
  for (const body of [initialize, [initialize]]) {
    const res = await post('/api/balance', body);
    assert.equal(res.status, 400);
    const reply = (await res.json()) as { jsonrpc: string; id: unknown; error: { code: number; message: string } };
    assert.equal(reply.jsonrpc, '2.0');
    assert.equal(reply.id, Array.isArray(body) ? null : 0);
    assert.equal(reply.error.message, "/api/balance is call4me's REST API, not its MCP server: connect your MCP client to https://call4.me/mcp");
  }
});

test('REST requests and sign-in pass through untouched', async (t) => {
  const { request, post } = await setup(t);
  const rest = await request('/api/calls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: '+14155550123', business: 'Nopa', goal: 'Book a table', category: 'restaurant' }) });
  assert.equal(rest.status, 401);
  assert.deepEqual(Object.keys((await rest.json()) as object), ['error']);
  const listed = await request('/api/calls', { headers: { authorization: `Bearer ${KEY}` } });
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(((await listed.json()) as { calls: unknown[] }).calls));
  const res = await post('/api/auth/sign-in', initialize);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), initialize);
});
