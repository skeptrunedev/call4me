import { describe, expect, it } from 'vitest';
import { canonicalRedirect } from '../src/server/lib/context';

// As configured after a move: new canonical host, old one kept as legacy.
const env = { CANONICAL_HOST: 'call4.me', LEGACY_HOSTS: 'callbay.skeptrune.com' } as never;
const at = (u: string) => canonicalRedirect(new URL(u), env);

describe('canonical host redirects', () => {
  it('serves the canonical host and localhost in place', () => {
    expect(at('https://call4.me/account')).toBeNull();
    expect(at('http://localhost:8791/')).toBeNull();
  });

  it('sends pages on a legacy host to the canonical one, keeping path and query', () => {
    expect(at('https://callbay.skeptrune.com/')).toBe('https://call4.me/');
    expect(at('https://callbay.skeptrune.com/account/calls/c1?x=1')).toBe('https://call4.me/account/calls/c1?x=1');
    expect(at('https://callbay.skeptrune.com/rules')).toBe('https://call4.me/rules');
  });

  it('keeps machine endpoints answering on a legacy host', () => {
    for (const path of [
      '/mcp', '/mcp/cb_live_abc', '/api/auth/oauth2/token', '/.well-known/oauth-authorization-server', '/oauth/consent', '/login?client_id=a&sig=b', '/webhooks/stripe', '/webhooks/telnyx', '/voice/stream/c1/sig',
      '/api', '/api?amount=25', '/a2a', '/auth.md', '/.well-known/agent-card.json', '/.well-known/mcp/server-card.json', '/.well-known/http-message-signatures-directory',
    ]) {
      expect(at('https://callbay.skeptrune.com' + path), path).toBeNull();
    }
  });

  it('sends crawler files on a legacy host to the canonical ones', () => {
    expect(at('https://callbay.skeptrune.com/robots.txt')).toBe('https://call4.me/robots.txt');
    expect(at('https://callbay.skeptrune.com/sitemap.xml')).toBe('https://call4.me/sitemap.xml');
    expect(at('https://callbay.skeptrune.com/llms.txt')).toBe('https://call4.me/llms.txt');
  });

  it('still redirects unknown hosts such as workers.dev, even on machine paths', () => {
    expect(at('https://callbay.nick.workers.dev/mcp')).toBe('https://call4.me/mcp');
  });

  it('changes nothing while there are no legacy hosts', () => {
    const today = { CANONICAL_HOST: 'callbay.skeptrune.com', LEGACY_HOSTS: '' } as never;
    expect(canonicalRedirect(new URL('https://callbay.skeptrune.com/mcp'), today)).toBeNull();
    expect(canonicalRedirect(new URL('https://x.workers.dev/'), today)).toBe('https://callbay.skeptrune.com/');
  });
});
