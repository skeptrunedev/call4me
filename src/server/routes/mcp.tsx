import { Hono } from 'hono';
import { createMcpHandler, hostHeaderValidationResponse } from '@modelcontextprotocol/server';
import { accountForToken, bearerToken, challenge, looksLikeJwt, sessionAccount, verifyMcpToken, type McpPath } from '../lib/auth';
import { legacyHosts, origin, stripeFor, viewerKey, type AppContext, type AppEnv } from '../lib/context';
import { describeKey, normalizeKey } from '../lib/keys';
import { installPrompt } from '../lib/prompts';
import { accounts, type Account } from '../services/accounts';
import type { Surface } from '../services/intake';
import { createCall4meServer, withCurrentToolNames } from '../mcp/server';
import { numbers } from '../services/numbers';
import { McpPage } from '../views/account';

/**
 * The MCP endpoint. The key rides in the path (/mcp/<key>) so one URL works in every
 * client, including the ones whose connector UI has no header field; a Bearer header on
 * /mcp works too. Stateless: a fresh McpServer per request.
 */
export const mcp = new Hono<AppEnv>();

/** DNS-rebinding guard the MCP spec asks for: only our own hostnames may address the endpoint. */
const allowedHosts = (c: AppContext) => [c.env.CANONICAL_HOST, ...legacyHosts(c.env), 'localhost', '127.0.0.1', '[::1]'].filter(Boolean);

async function serve(c: AppContext, account: Account, surface: Surface = 'agents'): Promise<Response> {
  const rejected = hostHeaderValidationResponse(c.req.raw, allowedHosts(c));
  if (rejected) return rejected;
  const handler = createMcpHandler(() => createCall4meServer({ env: c.env, origin: origin(c), account, stripe: () => stripeFor(c), surface }), {
    legacy: 'stateless',
    onerror: (err) => console.warn('mcp', String(err)),
  });
  return handler.fetch(await withCurrentToolNames(c.req.raw));
}

// MCP clients always GET with Accept: text/event-stream (the streamable HTTP spec requires
// it); everyone else, including link unfurlers that send Accept: */*, gets the page.
const wantsHtml = (c: AppContext) => !(c.req.header('accept') ?? '').includes('text/event-stream');

// The install page. /mcp is mounted ahead of the session middleware (MCP requests carry
// their own auth), so the page looks up the viewer itself to put their key in the prompt.
mcp.get('/', async (c) => {
  if (!wantsHtml(c)) return c.text('POST MCP requests here', 405);
  const account = await sessionAccount(c);
  const [key, owned] = await Promise.all([viewerKey(c, account), account ? numbers(c.env).views(account.id) : []]);
  return c.html(<McpPage signedIn={Boolean(account)} installPrompt={installPrompt(origin(c), key)} origin={origin(c)} apiKey={key} numbers={owned} />);
});

/**
 * An OAuth access token from our provider for this endpoint's resource (clients that sign in
 * through the browser), or an API key as a Bearer token. No token: the RFC 9728 challenge that
 * starts sign-in.
 */
async function authorized(c: AppContext, path: McpPath, surface: Surface): Promise<Response> {
  const raw = bearerToken(c);
  if (!raw) return challenge(c, 'sign in to call4me to use this server', undefined, path);
  const token = normalizeKey(raw);
  if (looksLikeJwt(token)) {
    let why = 'it belongs to no account';
    try {
      const account = await accountForToken(c, await verifyMcpToken(c, token, path));
      if (account) return serve(c, account, surface);
    } catch (err) {
      why = String(err);
      console.warn('mcp token rejected', why);
    }
    return challenge(c, `access token not accepted (${token.length} characters): ${why}`, 'invalid_token', path);
  }
  const account = await accounts(c.env.DB).byKey(raw);
  return account ? serve(c, account, surface) : challenge(c, `call4me key not accepted: ${describeKey(raw)}`, 'invalid_token', path);
}

mcp.all('/', (c) => authorized(c, '/mcp', 'agents'));

/** /mcp/<key>: the key rides in the URL for clients whose connector UI can't sign in or set headers. */
mcp.get('/:key', (c) => (wantsHtml(c) ? c.redirect('/mcp', 302) : c.text('POST MCP requests here', 405)));
mcp.all('/:key', async (c) => {
  const raw = c.req.param('key');
  const account = await accounts(c.env.DB).byKey(raw);
  if (!account) return c.json({ jsonrpc: '2.0', error: { code: -32001, message: `call4me key not accepted: ${describeKey(raw)}. Your key is at ${origin(c)}/account, or use ${origin(c)}/mcp and sign in.` }, id: null }, 401);
  return serve(c, account);
});

/**
 * A server listed in an app directory (DIRECTORY_SERVERS: /chatgpt/mcp, /claude/mcp). Same
 * accounts and sign-in, its own OAuth resource, and that directory's tool set (McpDeps.surface).
 */
export function directoryMcp(path: McpPath, surface: Surface): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get('/', (c) => (wantsHtml(c) ? c.redirect('/mcp', 302) : c.text('POST MCP requests here', 405)));
  app.all('/', (c) => authorized(c, path, surface));
  return app;
}
