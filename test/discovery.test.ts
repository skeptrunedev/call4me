import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { callbaySkillMd } from '../src/server/lib/callbay-skill';
import {
  agentAuth, aiCatalog, AI_CRAWLERS, authMd, buildApiCatalog, DISALLOW, llmsTxt, robotsTxt, serverCard, siteProtectedResource, sitemapXml, SITEMAP_PAGES, webBotAuthDirectory,
} from '../src/server/lib/discovery';
import { PAGES } from '../src/server/lib/pages';

const SITE = 'https://call4.me';

/** Tool names the MCP server really registers, read from its source. */
const TOOLS = new Set([...readFileSync('src/server/mcp/server.ts', 'utf8').matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((m) => m[1]!));

/** Private pages: never in the sitemap, always disallowed for crawlers. */
const PRIVATE = [
  '/account', '/account/calls/c1', '/welcome', '/login', '/logout', '/oauth/consent', '/add-funds', '/buy', '/unsubscribe', '/mcp/cb_live_abc',
  '/blog/support', '/blog/support/done', '/blog/subscribe/confirm', '/blog/unsubscribe', '/admin/blog',
];
const disallowed = (path: string) => DISALLOW.some((p) => path.startsWith(p));

describe('robots.txt', () => {
  const txt = robotsTxt(SITE);
  it('has a wildcard group, a group per named AI crawler, content signals, the sitemap, and the ARD pointer', () => {
    expect(txt).toContain('User-agent: *\n');
    for (const ua of AI_CRAWLERS) expect(txt).toContain(`User-agent: ${ua}\n`);
    expect(txt.match(/^Content-Signal: search=yes, ai-input=yes, ai-train=no$/gm)).toHaveLength(AI_CRAWLERS.length + 1);
    expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(txt).toContain(`Agentmap: ${SITE}/.well-known/ai-catalog.json`);
  });
  it('keeps crawlers out of private pages but not the public ones', () => {
    for (const p of PRIVATE) expect(disallowed(p), p).toBe(true);
    for (const p of ['/', '/mcp', '/rules', '/privacy', '/terms', '/llms.txt', '/auth.md', '/.well-known/api-catalog', '/blog', '/blog/archive', '/blog/feed.xml', '/blog/some-post']) expect(disallowed(p), p).toBe(false);
  });
});

describe('sitemap.xml', () => {
  const xml = sitemapXml(SITE);
  it('lists the public pages as absolute URLs and nothing private', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(SITEMAP_PAGES.map((e) => `${SITE}${PAGES[e.page].path}`));
    for (const loc of locs) expect(disallowed(new URL(loc!).pathname), loc).toBe(false);
  });
});

describe('agent-facing docs', () => {
  const docs = { skill: callbaySkillMd(SITE, 25), authMd: authMd(SITE), llms: llmsTxt(SITE, 25) };
  it('name only tools the MCP server registers', () => {
    expect(TOOLS.size).toBeGreaterThan(5);
    for (const [name, text] of Object.entries(docs)) {
      for (const m of text.matchAll(/\bcallbay_[a-z_]+/g)) expect(TOOLS.has(m[0]), `${name}: ${m[0]}`).toBe(true);
    }
  });
  it('point at this site', () => {
    expect(docs.skill).toMatch(/^---\nname: callbay\ndescription: /);
    expect(docs.skill).toContain(`${SITE}/mcp`);
    expect(docs.authMd).toContain(`POST ${SITE}/api/auth/oauth2/register`);
    expect(docs.llms).toContain('$0.25 per minute');
    expect(docs.llms.startsWith('# callbay\n\n> ')).toBe(true);
  });
});

describe('discovery documents', () => {
  it('server card is the SEP shape scanners read', () => {
    const card = serverCard(SITE, { name: 'callbay', version: '1.0.0' });
    expect(card.serverInfo).toEqual({ name: 'callbay', version: '1.0.0', title: 'callbay' });
    expect(card.url).toBe(`${SITE}/mcp`);
    expect(card.transport).toEqual({ type: 'streamable-http', endpoint: '/mcp' });
    expect(card.tools).toEqual(['dynamic']);
  });
  it('ARD entries use urn:air identifiers on this host and link here', () => {
    const doc = aiCatalog(SITE);
    expect(doc.host.identifier).toBe('did:web:call4.me');
    for (const e of doc.entries) {
      expect(e.identifier).toMatch(/^urn:air:call4\.me:[a-z]+:[a-z0-9]+$/);
      expect(e.url.startsWith(`${SITE}/`)).toBe(true);
      expect(e.representativeQueries.length).toBeGreaterThan(0);
    }
  });
  it('API catalog is an RFC 9727 linkset anchored on this site', () => {
    const { linkset } = buildApiCatalog(SITE);
    expect(linkset.map((l) => l.anchor)).toEqual([`${SITE}/mcp`, `${SITE}/api`, `${SITE}/.well-known/agent-skills`]);
  });
  it('root protected resource metadata names the site and its issuer', () => {
    expect(siteProtectedResource(SITE)).toMatchObject({ resource: `${SITE}/`, authorization_servers: [`${SITE}/api/auth`], scopes_supported: ['calls'] });
    expect(agentAuth(SITE)).toMatchObject({ register_uri: `${SITE}/api/auth/oauth2/register`, identity_types_supported: ['anonymous'] });
  });
  it('web bot auth directory publishes the public key only', () => {
    const jwk = { crv: 'Ed25519', d: 'secret', x: 'pub', kty: 'OKP', kid: 'thumb' };
    const dir = webBotAuthDirectory(JSON.stringify(jwk));
    expect(dir.keys).toHaveLength(1);
    expect(dir.keys[0]).toMatchObject({ kty: 'OKP', crv: 'Ed25519', x: 'pub', kid: 'thumb', use: 'sig', alg: 'EdDSA' });
    expect(JSON.stringify(dir)).not.toContain('secret');
  });
});
