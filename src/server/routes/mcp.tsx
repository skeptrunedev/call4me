import { Hono } from 'hono';
import { createMcpHandler, hostHeaderValidationResponse } from '@modelcontextprotocol/server';
import { accountForToken, bearerToken, challenge, looksLikeJwt, verifyMcpToken } from '../lib/auth';
import { origin, stripeFor, type AppContext, type AppEnv } from '../lib/context';
import { installPrompt } from '../lib/prompts';
import { accounts, type Account } from '../services/accounts';
import { createCallbayServer } from '../mcp/server';
import { McpPage } from '../views/account';

/**
 * The MCP endpoint. The key rides in the path (/mcp/<key>) so one URL works in every
 * client, including the ones whose connector UI has no header field; a Bearer header on
 * /mcp works too. Stateless: a fresh McpServer per request.
 */
export const mcp = new Hono<AppEnv>();

/** DNS-rebinding guard the MCP spec asks for: only our own hostnames may address the endpoint. */
const allowedHosts = (c: AppContext) => [c.env.CANONICAL_HOST, 'localhost', '127.0.0.1', '[::1]'].filter(Boolean);

function serve(c: AppContext, account: Account): Promise<Response> | Response {
  const rejected = hostHeaderValidationResponse(c.req.raw, allowedHosts(c));
  if (rejected) return rejected;
  const handler = createMcpHandler(() => createCallbayServer({ env: c.env, origin: origin(c), account, stripe: () => stripeFor(c) }), {
    legacy: 'stateless',
    onerror: (err) => console.warn('mcp', String(err)),
  });
  return handler.fetch(c.req.raw);
}

// MCP clients always GET with Accept: text/event-stream (the streamable HTTP spec requires
// it); everyone else, including link unfurlers that send Accept: */*, gets the page.
const wantsHtml = (c: AppContext) => !(c.req.header('accept') ?? '').includes('text/event-stream');

mcp.get('/', (c) => (wantsHtml(c) ? c.html(<McpPage signedIn={false} installPrompt={installPrompt(origin(c), null)} origin={origin(c)} />) : c.text('POST MCP requests here', 405)));

/**
 * /mcp: an OAuth access token from our provider (clients that sign in through the browser),
 * or an API key as a Bearer token. No token: the RFC 9728 challenge that starts sign-in.
 */
mcp.all('/', async (c) => {
  const token = bearerToken(c);
  if (!token) return challenge(c, 'sign in to callbay to use this server');
  if (looksLikeJwt(token)) {
    try {
      const account = await accountForToken(c, await verifyMcpToken(c, token));
      if (account) return serve(c, account);
    } catch (err) {
      console.warn('mcp token rejected', String(err));
    }
    return challenge(c, 'invalid or expired access token', 'invalid_token');
  }
  const account = await accounts(c.env.DB).byKey(token);
  return account ? serve(c, account) : challenge(c, 'invalid callbay key', 'invalid_token');
});

/** /mcp/<key>: the key rides in the URL for clients whose connector UI can't sign in or set headers. */
mcp.get('/:key', (c) => (wantsHtml(c) ? c.redirect('/mcp', 302) : c.text('POST MCP requests here', 405)));
mcp.all('/:key', async (c) => {
  const account = await accounts(c.env.DB).byKey(c.req.param('key'));
  if (!account) return c.json({ jsonrpc: '2.0', error: { code: -32001, message: `callbay: invalid key. Use ${origin(c)}/mcp and sign in, or create a key at ${origin(c)}/account.` }, id: null }, 401);
  return serve(c, account);
});
