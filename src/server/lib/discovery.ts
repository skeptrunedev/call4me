import type { Post } from './blog';
import { PAGES, type PageKey } from './pages';

/** What the sitemap and llms.txt need from a blog post. */
export type PostEntry = Pick<Post, 'slug' | 'title' | 'description' | 'date' | 'updated'>;

/**
 * The documents a crawler or an agent reads to find its way around call4me: robots.txt with
 * crawl rules and content signals, the sitemap, llms.txt, the MCP server card, the ARD
 * capability manifest, auth.md, and the root OAuth protected resource metadata. Pure
 * builders, served by routes/agent.tsx; `site` is the origin as agents should see it
 * (siteUrl in auth-options.ts), so every link points back at the host that was asked.
 */

/** Crawlers we name explicitly so the policy is unambiguous: search and answer engines are welcome. */
export const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', // OpenAI
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', // Anthropic
  'Google-Extended', 'Googlebot', // Google
  'PerplexityBot', 'Perplexity-User', // Perplexity
  'Applebot', 'Applebot-Extended', // Apple
  'Bingbot', 'DuckAssistBot', 'meta-externalagent', 'Amazonbot', 'MistralAI-User', 'cohere-ai', 'CCBot', 'Bytespider',
];

/**
 * Paths that are per-user, side-effecting, or carry a secret; nothing a crawler should walk.
 * /mcp/ (with the slash) is the key-in-URL form of the MCP endpoint; the /mcp page stays open.
 */
export const DISALLOW = [
  '/account', '/welcome', '/login', '/logout', '/oauth/', '/add-funds', '/buy', '/unsubscribe', '/mcp/', '/api/auth/', '/webhooks/', '/voice/',
  // The blog's checkout, emailed-link pages, and back office; the posts themselves are open.
  '/blog/support', '/blog/subscribe/', '/blog/unsubscribe', '/admin/',
];

/** Content Signals (contentsignals.org): search and answer engines may use the content; training is not granted. */
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=no';

export function robotsTxt(site: string): string {
  return [
    '# call4me: your AI agent makes phone calls for you. Crawl away; the machine-readable',
    `# entry points are the sitemap below, ${site}/llms.txt, ${site}/.well-known/api-catalog,`,
    `# ${site}/.well-known/agent-skills/index.json, and the MCP server at ${site}/mcp.`,
    '',
    'User-agent: *',
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    'Allow: /',
    `Content-Signal: ${CONTENT_SIGNAL}`,
    '',
    ...AI_CRAWLERS.flatMap((ua) => [`User-agent: ${ua}`, ...DISALLOW.map((p) => `Disallow: ${p}`), 'Allow: /', `Content-Signal: ${CONTENT_SIGNAL}`, '']),
    `Sitemap: ${site}/sitemap.xml`,
    // ARD (agenticresourcediscovery.org): where the capability manifest lives.
    `Agentmap: ${site}/.well-known/ai-catalog.json`,
    '',
  ].join('\n');
}

/** The public pages, in sitemap order. Account, sign-in, checkout, and one-time pages are left out. */
export const SITEMAP_PAGES: { page: PageKey; changefreq: string; priority?: string }[] = [
  { page: 'home', changefreq: 'weekly', priority: '1.0' },
  { page: 'examples', changefreq: 'monthly', priority: '0.9' },
  { page: 'mcp', changefreq: 'monthly', priority: '0.9' },
  { page: 'blog', changefreq: 'weekly', priority: '0.7' },
  { page: 'blogArchive', changefreq: 'weekly' },
  { page: 'rules', changefreq: 'monthly' },
  { page: 'privacy', changefreq: 'yearly' },
  { page: 'support', changefreq: 'yearly' },
  { page: 'terms', changefreq: 'yearly' },
];

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority?: string;
}

/** The public pages, then every blog post with its last-modified date. The sitemap and IndexNow (services/indexnow.ts) both read this. */
export function sitemapEntries(site: string, posts: PostEntry[] = []): SitemapEntry[] {
  return [
    ...SITEMAP_PAGES.map((e) => ({ loc: `${site}${PAGES[e.page].path}`, changefreq: e.changefreq, priority: e.priority })),
    ...posts.map((p) => ({ loc: `${site}/blog/${p.slug}`, lastmod: `${p.updated ?? p.date}T00:00:00Z`, changefreq: 'monthly', priority: '0.7' })),
  ];
}

export function sitemapXml(site: string, posts: PostEntry[] = []): string {
  const entries = sitemapEntries(site, posts);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) =>
      [`<url><loc>${xml(e.loc)}</loc>`, e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : '', `<changefreq>${e.changefreq}</changefreq>`, e.priority ? `<priority>${e.priority}</priority>` : '', '</url>'].join(''),
    ),
    '</urlset>',
    '',
  ].join('\n');
}

/** llms.txt (llmstxt.org): a short map of the site for language models, markdown, links first. */
export function llmsTxt(site: string, pricePerMinuteCents: number, posts: PostEntry[] = []): string {
  const price = `$${(pricePerMinuteCents / 100).toFixed(2)}`;
  return [
    '# call4me',
    '',
    `> your AI agent makes phone calls for you: restaurant bookings, doctor, dentist, and vet appointments, dealership and service questions, home internet, flight changes, and questions for any business in the US, Canada and Europe, or elsewhere with a call4me number in that country. The caller sounds like a normal person, asks your agent mid-call when it needs something, and your agent gets the outcome and transcript. Prepaid credits from $10; ${price} per minute of talk time; unanswered calls are free.`,
    '',
    'Everything goes through the MCP server, signed in as a call4me user (Google or X in the browser, then OAuth for the agent), or with an API key from the account page.',
    '',
    '## For agents',
    '',
    `- [MCP server](${site}/mcp): every operation as a tool at ${site}/mcp (Streamable HTTP); OAuth 2.1 sign-in, or an API key as a Bearer token or in the URL (${site}/mcp/<key>)`,
    `- [Agent Skills index](${site}/.well-known/agent-skills/index.json): call4me's own skill, how an agent sets up and places calls (Agent Skills Discovery v0.2.0)`,
    `- [API catalog](${site}/.well-known/api-catalog): RFC 9727 linkset of the machine interfaces`,
    `- [A2A agent card](${site}/.well-known/agent-card.json): what kinds of calls call4me makes and what each needs before dialing (JSON-RPC at ${site}/a2a)`,
    `- [Credits over x402](${site}/api): GET ${site}/api answers 402 with a USDC price on Base; pay it with a call4me key or OAuth token in the Authorization header and the credits land on that account (?amount=<dollars>, 10 to 500)`,
    `- [auth.md](${site}/auth.md): how an agent registers and signs in (OAuth protected resource metadata at ${site}/.well-known/oauth-protected-resource)`,
    '',
    '## Site',
    '',
    `- [Home](${site}/): what call4me does, pricing, and the install prompt`,
    `- [Examples](${site}/examples): real call recordings with edited excerpts, outcomes, and transcripts`,
    `- [Install MCP](${site}/mcp): one prompt for Claude Code, Codex, Claude Desktop, claude.ai, ChatGPT, Muse, and Grok Bot`,
    `- [Rules](${site}/rules): what call4me will and will not call for`,
    `- [Blog](${site}/blog): notes on AI agents that make phone calls, what call4me is good at, what changed (Atom feed at ${site}/blog/feed.xml)`,
    ...posts.map((p) => `  - [${p.title}](${site}/blog/${p.slug}): ${p.description}`),
    '',
    '## Optional',
    '',
    `- [Terms](${site}/terms)`,
    `- [Privacy](${site}/privacy): what is stored; call audio is never recorded; content signals: ${CONTENT_SIGNAL}`,
    '',
  ].join('\n');
}

// ---- MCP server card, ARD manifest

export const SERVER_CARD_PROTOCOL = '2026-07-28';

/** MCP Server Card (SEP-1649 shape, the one scanners validate) at the well-known path and its alias. */
export function serverCard(site: string, server: { name: string; version: string }) {
  return {
    version: '1.0',
    protocolVersion: SERVER_CARD_PROTOCOL,
    serverInfo: { name: server.name, version: server.version, title: 'call4me' },
    description: 'call4me places real phone calls for the user: bookings, appointments, and questions for a business. Tools check what a call needs, place it, follow it live, answer the caller\'s questions mid-call, and manage the prepaid balance and calling profile.',
    url: `${site}/mcp`,
    transport: { type: 'streamable-http', endpoint: '/mcp' },
    capabilities: { tools: { listChanged: false } },
    authentication: { required: true, schemes: ['oauth2'] },
    documentationUrl: `${site}/mcp`,
    instructions: 'Every tool acts for a signed-in call4me user. A request without a token gets an OAuth challenge; the client signs the user in (Google or X) and retries. An API key from the account page works as a Bearer token or in the URL (/mcp/<key>).',
    tools: ['dynamic'],
    _meta: { 'me.call4/oauthProtectedResource': `${site}/.well-known/oauth-protected-resource/mcp`, 'me.call4/authMd': `${site}/auth.md` },
  };
}

/** ARD capability manifest (agenticresourcediscovery.org, ai-catalog data model 1.0). */
export function aiCatalog(site: string) {
  const host = new URL(site).hostname;
  const entry = (ns: string, name: string, displayName: string, type: string, url: string, description: string, queries: string[]) => ({
    identifier: `urn:air:${host}:${ns}:${name}`,
    displayName,
    description,
    type,
    url,
    representativeQueries: queries,
  });
  return {
    specVersion: '1.0',
    host: { displayName: 'call4me', identifier: `did:web:${host}`, url: site, description: 'your AI agent makes phone calls for you' },
    entries: [
      entry('server', 'mcp', 'call4me MCP server', 'application/mcp-server-card+json', `${site}/.well-known/mcp/server-card.json`, 'Place phone calls for the user and follow them live: requirements per kind of call, dialing, mid-call questions, outcomes and transcripts, balance and profile.', [
        'call the restaurant and book a table for 4 tomorrow at 7', 'book a dentist appointment for next week', 'call the dealership and ask about a service slot', 'have my agent make a phone call',
      ]),
      entry('agent', 'a2a', 'call4me A2A agent', 'application/json', `${site}/.well-known/agent-card.json`, 'A2A 1.0 agent card; SendMessage over JSON-RPC at /a2a lists the kinds of calls call4me makes and what each needs before dialing.', ['what information does call4me need to book a doctor appointment', 'which kinds of calls can call4me make']),
      entry('skills', 'index', 'Agent Skills discovery index', 'application/agent-skills+json', `${site}/.well-known/agent-skills/index.json`, "call4me's own skill: how an agent installs call4me, sets up the calling profile, and places and follows calls (Agent Skills Discovery v0.2.0).", [
        'install the call4me skill', 'how does an agent place a phone call with call4me',
      ]),
      entry('doc', 'llms', 'llms.txt', 'text/markdown', `${site}/llms.txt`, 'A short map of the site for language models.', ['what is call4me', 'how do agents use call4me']),
      entry('doc', 'blog', 'call4me blog', 'application/atom+xml', `${site}/blog/feed.xml`, 'Atom feed of the call4me blog: notes on AI agents that make phone calls for you. Every post also answers Accept: text/markdown.', ['call4me blog', 'what is new at call4me']),
      entry('auth', 'oauth', 'OAuth protected resource metadata', 'application/json', `${site}/.well-known/oauth-protected-resource`, 'How agents obtain OAuth 2.1 tokens for call4me (PKCE, dynamic client registration); prose version at /auth.md.', ['how does an agent sign in to call4me', 'register an oauth client for call4me']),
    ],
  };
}

// ---- auth

/** auth.md (WorkOS proposal): how an agent registers and signs in, in prose, with the same facts as the metadata. */
export function authMd(site: string): string {
  return [
    '# call4me auth.md',
    '',
    "How an AI agent gets credentials for call4me. Every call4me operation acts for a call4me user: placing calls, reading calls and the calling profile, and spending or adding credits. Reading the site and its discovery documents needs nothing.",
    '',
    '## Who signs in',
    '',
    'Agents act on behalf of a call4me user. There are no agent-only accounts: the user signs in through the browser (Google or X) and approves the agent once. Tokens are then bound to that user and spend that user\'s credits.',
    '',
    '## Registration',
    '',
    `- Authorization server: ${site}/api/auth (metadata at ${site}/.well-known/oauth-authorization-server)`,
    `- Dynamic client registration (RFC 7591), no credentials needed: POST ${site}/api/auth/oauth2/register with client_name, redirect_uris, grant_types ["authorization_code","refresh_token"], response_types ["code"], token_endpoint_auth_method "none", and application_type "native" when the redirect URI is a loopback address.`,
    `- Protected resources: ${site}/mcp (the MCP server) and ${site}/ (GET /api, credits over x402); metadata at ${site}/.well-known/oauth-protected-resource/mcp and ${site}/.well-known/oauth-protected-resource. Ask for the one you need with the RFC 8707 resource parameter; the scope is \`calls\`.`,
    '',
    '## Getting a token',
    '',
    `1. Send the user to ${site}/api/auth/oauth2/authorize with response_type=code, your client_id, redirect_uri, scope (calls offline_access), a PKCE S256 code_challenge, state, and resource.`,
    '2. The user signs in with Google or X and approves. The browser returns to your redirect URI with a code.',
    `3. POST ${site}/api/auth/oauth2/token with grant_type=authorization_code, the code, client_id, redirect_uri, code_verifier, and resource. You get a Bearer access token (JWT, valid one week) and, with offline_access, a refresh token.`,
    `4. Send \`Authorization: Bearer <token>\` to ${site}/mcp. A 401 with a WWW-Authenticate challenge means sign in (again).`,
    '',
    'MCP clients do all of this automatically when the server answers with the challenge.',
    '',
    '## API keys',
    '',
    `A signed-in user can also create an API key on ${site}/account and give it to the agent. It works as \`Authorization: Bearer <key>\` on ${site}/mcp and ${site}/api, or in the URL as ${site}/mcp/<key> for clients that cannot sign in or set headers. Creating a new key revokes the old one.`,
    '',
    '## Revocation',
    '',
    `Access tokens expire after a week; refresh tokens rotate on use. Users revoke an API key by creating a new one on ${site}/account.`,
    '',
  ].join('\n');
}

/**
 * The agent_auth block auth.md asks for: where an agent registers and which identity flows exist.
 * Ours is the anonymous flow: any client may register itself and then act for a user who signs in.
 */
export function agentAuth(site: string) {
  return {
    skill: `${site}/auth.md`,
    register_uri: `${site}/api/auth/oauth2/register`,
    identity_types_supported: ['anonymous'],
    anonymous: { credential_types_supported: ['oauth2_client'] },
    claim_uri: `${site}/auth.md`,
  };
}

/**
 * RFC 9728 protected resource metadata for the site itself: GET /api takes the same OAuth tokens
 * as the MCP server. The MCP endpoint's own document is served by the auth plugin at
 * /.well-known/oauth-protected-resource/mcp.
 */
export function siteProtectedResource(site: string) {
  return {
    resource: `${site}/`,
    authorization_servers: [`${site}/api/auth`],
    bearer_methods_supported: ['header'],
    scopes_supported: ['calls'],
    resource_name: 'call4me',
    resource_documentation: `${site}/auth.md`,
    resource_signing_alg_values_supported: ['EdDSA'],
  };
}

/**
 * RFC 9728 protected resource metadata for the ChatGPT directory's MCP server (/chatgpt/mcp). The
 * auth plugin serves only the /mcp document, so this one mirrors it for the second resource.
 */
export function chatgptMcpProtectedResource(site: string) {
  return {
    resource: `${site}/chatgpt/mcp`,
    authorization_servers: [`${site}/api/auth`],
    bearer_methods_supported: ['header'],
    scopes_supported: ['calls'],
    resource_name: 'call4me for ChatGPT',
    resource_documentation: `${site}/auth.md`,
  };
}

/** Web Bot Auth directory: the public half of WEB_BOT_AUTH_KEY (an Ed25519 private JWK as JSON). */
export function webBotAuthDirectory(privateJwk: string) {
  const priv = JSON.parse(privateJwk) as Record<string, unknown>;
  const { d: _d, ...pub } = priv;
  void _d;
  return { keys: [{ ...pub, use: 'sig', alg: 'EdDSA', nbf: 1789500000, exp: 1852000000 }] };
}

// ---- RFC 9727 API catalog, Agent Skills index

export const API_CATALOG_PROFILE = 'https://www.rfc-editor.org/info/rfc9727';
export const API_CATALOG_MEDIA_TYPE = `application/linkset+json; profile="${API_CATALOG_PROFILE}"`;
export const API_CATALOG_LINK = '</.well-known/api-catalog>; rel="api-catalog"';
export const SKILLS_INDEX_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

/**
 * RFC 9727 API catalog (a RFC 9264 Linkset) served at /.well-known/api-catalog: the MCP server
 * (described by its server card), credits over x402 at /api, and the Agent Skills index.
 */
export function buildApiCatalog(site: string) {
  return {
    linkset: [
      {
        anchor: `${site}/api/calls`,
        'service-desc': [{ href: `${site}/api/openapi.json`, type: 'application/vnd.oai.openapi+json', title: 'call4me recording API' }],
      },
      {
        anchor: `${site}/mcp`,
        'service-desc': [{ href: `${site}/.well-known/mcp/server-card.json`, type: 'application/json', title: 'call4me MCP server card' }],
        'service-doc': [{ href: `${site}/mcp`, type: 'text/html' }],
        'service-meta': [{ href: `${site}/terms`, type: 'text/html' }],
      },
      {
        anchor: `${site}/api`,
        'service-doc': [{ href: `${site}/llms.txt`, type: 'text/markdown', title: 'call4me credits over x402 (GET /api answers 402)' }],
        'service-meta': [{ href: `${site}/terms`, type: 'text/html' }],
      },
      {
        anchor: `${site}/.well-known/agent-skills`,
        'service-desc': [{ href: `${site}/.well-known/agent-skills/index.json`, type: 'application/json', title: 'Agent Skills Discovery index (RFC v0.2.0)' }],
        'service-doc': [{ href: `${site}/mcp`, type: 'text/html' }],
      },
    ],
  };
}
