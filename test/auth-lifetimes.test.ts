import assert from 'node:assert/strict';
import test from 'node:test';
import { authOptions } from '../src/server/lib/auth-options';

const options = authOptions({
  database: undefined,
  secret: 'test-only-auth-lifetime-secret-0123456789',
  baseURL: 'https://call4.me',
  appName: 'call4me',
  google: { clientId: '', clientSecret: '' },
  twitter: { clientId: '', clientSecret: '' },
});
const provider = options.plugins.find((plugin) => plugin.id === 'oauth-provider')!.options;
const day = 24 * 3600;

test('the provider-wide access-token limit does not silently cap resources at one hour', () => {
  // Inspect the constructed plugin, including its applied defaults, not source text.
  assert.equal(provider.accessTokenExpiresIn, 7 * day);
  assert.deepEqual(provider.resources.map((resource) => resource.identifier), [
    'https://call4.me/mcp', 'https://call4.me/chatgpt/mcp', 'https://call4.me/claude/mcp', 'https://call4.me/',
  ]);
  for (const resource of provider.resources) {
    assert.equal(Math.min(provider.accessTokenExpiresIn, resource.accessTokenTtl), 7 * day, resource.identifier);
  }
});

test('long-lived renewal remains available without making access tokens permanent', () => {
  assert.equal(provider.refreshTokenExpiresIn, 10 * 365 * day);
  assert.ok(provider.scopes.includes('offline_access'));
  assert.equal(provider.codeExpiresIn, 3600);
  assert.ok(provider.accessTokenExpiresIn < provider.refreshTokenExpiresIn);
});

test('browser sessions renew daily and retain the existing cookie name', () => {
  assert.equal(options.session.expiresIn, 400 * day);
  assert.equal(options.session.updateAge, day);
  assert.equal(options.advanced.cookiePrefix, 'callbay');
});
