import { Hono } from 'hono';
import { a2aDispatch, agentCard } from '../lib/a2a';
import { siteUrl } from '../lib/auth-options';
import { origin, type AppEnv } from '../lib/context';
import { SERVER_VERSION } from '../mcp/server';

/** A2A agent card and JSON-RPC endpoint (see lib/a2a.ts). */
export const a2a = new Hono<AppEnv>();

const JSON_HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'Content-Type, Authorization' };

a2a.on(['GET', 'HEAD'], '/.well-known/agent-card.json', (c) => {
  const headers = { ...JSON_HEADERS, 'cache-control': 'public, max-age=3600' };
  return c.req.method === 'HEAD' ? c.body(null, 200, headers) : c.body(JSON.stringify(agentCard(siteUrl(origin(c)), SERVER_VERSION), null, 2) + '\n', 200, headers);
});

a2a.get('/a2a', (c) => c.redirect('/.well-known/agent-card.json', 302));
a2a.options('/a2a', (c) => c.body(null, 204, JSON_HEADERS));

a2a.post('/a2a', async (c) => {
  const { status, body } = a2aDispatch(await c.req.text(), siteUrl(origin(c)));
  return c.body(JSON.stringify(body), status as 200, JSON_HEADERS);
});
