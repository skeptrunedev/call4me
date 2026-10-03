import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { Hono } from 'hono';

// The route imports the voice session, whose base class is supplied by Workers.
const workerModule = `export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent(workerModule)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { mcp, directoryMcp } = await import('../src/server/routes/mcp');
const app = new Hono();
app.route('/mcp', mcp);
app.route('/chatgpt/mcp', directoryMcp('/chatgpt/mcp', 'chatgpt'));
app.route('/claude/mcp', directoryMcp('/claude/mcp', 'claude'));
const paths = ['/mcp', '/chatgpt/mcp', '/claude/mcp'];

test('Codex discovery GET receives the resource challenge without an Accept header', async () => {
  for (const path of paths) {
    for (const accept of [undefined, '*/*']) {
      const headers = new Headers({ 'MCP-Protocol-Version': '2024-11-05' });
      if (accept) headers.set('accept', accept);
      const response = await app.request(`https://call4.me${path}`, { headers }, {});
      assert.equal(response.status, 401, path);
      assert.equal(response.headers.get('www-authenticate'), `Bearer resource_metadata="https://call4.me/.well-known/oauth-protected-resource${path}"`);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    }
  }
});

test('unauthenticated event stream GET receives OAuth discovery before transport rejection', async () => {
  for (const path of paths) {
    const response = await app.request(`https://call4.me${path}`, { headers: { accept: 'text/event-stream' } }, {});
    assert.equal(response.status, 401, path);
    assert.ok(response.headers.get('www-authenticate')?.includes(`oauth-protected-resource${path}`));
  }
});

test('browser and unfurler GET still render the signed out installation page', async () => {
  for (const accept of ['text/html', '*/*']) {
    const response = await app.request('https://call4.me/mcp', { headers: { accept } }, {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await response.text(), /install call4me/i);
  }
  for (const path of paths.slice(1)) {
    const response = await app.request(`https://call4.me${path}`, { headers: { accept: 'text/html' } }, {});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/mcp');
  }
});

test('unauthenticated POST retains the resource specific OAuth challenge', async () => {
  for (const path of paths) {
    const response = await app.request(`https://call4.me${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    }, {});
    assert.equal(response.status, 401, path);
    assert.ok(response.headers.get('www-authenticate')?.includes(`oauth-protected-resource${path}`));
  }
});
