import { Hono } from 'hono';
import { createAuth } from '../lib/auth';
import { DIRECTORY_SERVERS, siteUrl } from '../lib/auth-options';
import { origin, type AppContext, type AppEnv } from '../lib/context';
import { agentAuth, aiCatalog, authMd, directoryMcpProtectedResource, llmsTxt, robotsTxt, serverCard, siteProtectedResource, sitemapXml, webBotAuthDirectory } from '../lib/discovery';
import { SERVER_NAME, SERVER_VERSION } from '../mcp/server';
import { pricePerMinute } from '../services/dialer';
import { posts } from './blog';

/**
 * What a crawler or an agent needs to find its way around: robots.txt, the sitemap, llms.txt,
 * the MCP server card, the ARD manifest, auth.md, the Web Bot Auth key directory, and the
 * OAuth discovery documents at the site root. The documents themselves are built in
 * lib/discovery.ts; the Agent Skills index is routes/discovery.ts, A2A is routes/a2a.ts.
 */
export const agent = new Hono<AppEnv>();

const CACHE = { 'cache-control': 'public, max-age=600' };
const site = (c: AppContext) => siteUrl(origin(c));

agent.get('/robots.txt', (c) => c.text(robotsTxt(site(c)), 200, { 'content-type': 'text/plain; charset=utf-8', ...CACHE }));

agent.get('/sitemap.xml', (c) => c.body(sitemapXml(site(c), posts()), 200, { 'content-type': 'application/xml; charset=utf-8', ...CACHE }));

/** The IndexNow key file (services/indexnow.ts): search engines fetch it to check that our pings are ours. */
agent.get('/:file{[0-9a-f]{32}\\.txt}', (c) => {
  const key = c.env.INDEXNOW_KEY;
  if (!key || c.req.param('file') !== `${key}.txt`) return c.notFound();
  return c.text(key, 200, { 'content-type': 'text/plain; charset=utf-8', ...CACHE });
});

/** The OpenAI plugin portal checks that we own the MCP server's domain: the token, alone, as plain text. */
agent.get('/.well-known/openai-apps-challenge', (c) => {
  const token = c.env.OPENAI_APPS_CHALLENGE;
  return token ? c.text(token, 200, { 'content-type': 'text/plain; charset=utf-8' }) : c.notFound();
});

agent.get('/llms.txt', (c) => c.body(llmsTxt(site(c), pricePerMinute(c.env), posts()), 200, { 'content-type': 'text/markdown; charset=utf-8', ...CACHE }));

for (const path of ['/.well-known/mcp/server-card.json', '/.well-known/mcp.json']) {
  agent.get(path, (c) =>
    c.body(JSON.stringify(serverCard(site(c), { name: SERVER_NAME, version: SERVER_VERSION }), null, 2) + '\n', 200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': 'Content-Type',
      'cache-control': 'public, max-age=3600',
    }),
  );
}

for (const [path, type] of [['/.well-known/ai-catalog.json', 'application/ai-catalog+json'], ['/.well-known/ard.json', 'application/json']] as const) {
  agent.get(path, (c) => c.body(JSON.stringify(aiCatalog(site(c)), null, 2) + '\n', 200, { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=3600' }));
}

agent.get('/auth.md', (c) => c.body(authMd(site(c)), 200, { 'content-type': 'text/markdown; charset=utf-8', ...CACHE }));

/** Web Bot Auth: our signing key, so requests this worker sends as an agent can be verified (IETF webbotauth). */
agent.get('/.well-known/http-message-signatures-directory', (c) => {
  if (!c.env.WEB_BOT_AUTH_KEY) return c.notFound();
  return c.body(JSON.stringify(webBotAuthDirectory(c.env.WEB_BOT_AUTH_KEY), null, 2) + '\n', 200, {
    'content-type': 'application/http-message-signatures-directory+json',
    'cache-control': 'public, max-age=86400',
  });
});

// ---- OAuth discovery at the site root (RFC 8414 / RFC 9728 as agents probe them)

/**
 * The authorization server's issuer is <origin>/api/auth, so RFC 8414 puts its metadata at
 * /.well-known/oauth-authorization-server/api/auth. Agents also probe the bare root path;
 * answer both with the provider's document plus the agent_auth block.
 */
async function authServerMetadata(c: AppContext, servedAt: string): Promise<Response> {
  const url = new URL(c.req.url);
  url.pathname = servedAt;
  const res = await createAuth(c).handler(new Request(url, { method: 'GET', headers: c.req.raw.headers }));
  if (!res.ok) return res;
  const doc = (await res.json()) as Record<string, unknown>;
  const body = JSON.stringify({ ...doc, agent_auth: agentAuth(site(c)) });
  const headers = new Headers(res.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  return new Response(c.req.method === 'HEAD' ? null : body, { status: 200, headers });
}
for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/api/auth']) {
  agent.on(['GET', 'HEAD'], path, (c) => authServerMetadata(c, '/.well-known/oauth-authorization-server/api/auth'));
}
agent.on(['GET', 'HEAD'], '/.well-known/openid-configuration', (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/api/auth/.well-known/openid-configuration';
  return createAuth(c).handler(new Request(url, { method: c.req.method, headers: c.req.raw.headers }));
});

/** Protected resource metadata for the site itself and the app directories' servers; /.well-known/oauth-protected-resource/mcp stays with the auth plugin. */
for (const [path, metadata] of [
  ['/.well-known/oauth-protected-resource', siteProtectedResource],
  ...DIRECTORY_SERVERS.map((s) => [`/.well-known/oauth-protected-resource${s.path}`, (site: string) => directoryMcpProtectedResource(site, s)] as const),
] as const) {
  agent.on(['GET', 'HEAD'], path, (c) => {
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...CACHE };
    return c.req.method === 'HEAD' ? c.body(null, 200, headers) : c.body(JSON.stringify(metadata(site(c)), null, 2) + '\n', 200, headers);
  });
}
