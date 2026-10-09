/** Hosts call4me used to live on (LEGACY_HOSTS in wrangler.jsonc). */
export const legacyHosts = (env: Pick<Env, 'LEGACY_HOSTS'>): string[] =>
  (env.LEGACY_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

/**
 * Machine endpoints that keep answering on a legacy host: MCP clients, OAuth (tokens are
 * bound to the issuer origin they were minted on, and a sign-in started there must finish
 * there, so its docs at /auth.md and /.well-known/ describe that host), credits over x402
 * (/api), A2A, provider webhooks, and call audio. None of these follow redirects.
 */
const LEGACY_PASSTHROUGH = ['/mcp', '/api', '/.well-known/', '/auth.md', '/a2a', '/oauth/', '/login', '/logout', '/webhooks/', '/voice/'];

/** Where a request belongs if it's on the wrong host or plain http, or null to serve it here. */
export function canonicalRedirect(url: URL, env: Pick<Env, 'CANONICAL_HOST' | 'LEGACY_HOSTS'>): string | null {
  const canonical = env.CANONICAL_HOST;
  if (!canonical || url.hostname === 'localhost') return null;
  const onCanonical = url.hostname === canonical;
  if (onCanonical && url.protocol === 'https:') return null;
  // Machine clients don't follow redirects, so they keep answering on a legacy host or over http.
  if ((onCanonical || legacyHosts(env).includes(url.hostname)) && LEGACY_PASSTHROUGH.some((p) => url.pathname.startsWith(p))) return null;
  const to = new URL(url);
  to.hostname = canonical;
  to.protocol = 'https:';
  to.port = '';
  // Collapse the legacy homepage alias while canonicalizing the host so crawlers and
  // visitors need only one permanent redirect.
  if (to.pathname === '/home') to.pathname = '/';
  return to.toString();
}
