import { Hono } from 'hono';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { origin, stripeFor, type AppContext, type AppEnv } from '../lib/context';
import { installPrompt } from '../lib/prompts';
import { accounts } from '../services/accounts';
import { createCallbayServer } from '../mcp/server';
import { McpPage } from '../views/account';

/**
 * The MCP endpoint. The key rides in the path (/mcp/<key>) so one URL works in every
 * client, including the ones whose connector UI has no header field; a Bearer header on
 * /mcp works too. Stateless: a fresh McpServer per request.
 */
export const mcp = new Hono<AppEnv>();

async function serve(c: AppContext, key: string | undefined): Promise<Response> {
  const account = key ? await accounts(c.env.DB).byKey(key) : null;
  if (!account) {
    return c.json({ jsonrpc: '2.0', error: { code: -32001, message: `callbay: missing or invalid key. Get one at ${origin(c)} and use ${origin(c)}/mcp/<your key> as the server URL.` }, id: null }, 401);
  }
  const handler = createMcpHandler(() => createCallbayServer({ env: c.env, origin: origin(c), account, stripe: () => stripeFor(c) }), {
    legacy: 'stateless',
    onerror: (err) => console.warn('mcp', String(err)),
  });
  return handler.fetch(c.req.raw);
}

const wantsHtml = (c: AppContext) => (c.req.header('accept') ?? '').includes('text/html');
const bearer = (c: AppContext) => /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];

mcp.get('/', (c) => (wantsHtml(c) ? c.html(<McpPage signedIn={Boolean(c.get('account'))} installPrompt={installPrompt(origin(c), null)} />) : c.text('POST MCP requests here', 405)));
mcp.all('/', (c) => serve(c, bearer(c)));
mcp.get('/:key', (c) => (wantsHtml(c) ? c.redirect('/mcp', 302) : c.text('POST MCP requests here', 405)));
mcp.all('/:key', (c) => serve(c, c.req.param('key')));
