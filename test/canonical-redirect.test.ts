import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRedirect } from '../src/server/lib/context';

const env = { CANONICAL_HOST: 'call4.me', LEGACY_HOSTS: 'callbay.skeptrune.com' };
const to = (url: string) => canonicalRedirect(new URL(url), env);

test('https on the canonical host is served here', () => {
  assert.equal(to('https://call4.me/blog?tab=top'), null);
});

test('plain http on the canonical host moves to https', () => {
  assert.equal(to('http://call4.me/rules'), 'https://call4.me/rules');
  assert.equal(to('http://call4.me/blog?q=junk'), 'https://call4.me/blog?q=junk');
});

test('www and legacy hosts move to the canonical host over https', () => {
  assert.equal(to('http://www.call4.me/'), 'https://call4.me/');
  assert.equal(to('https://callbay.skeptrune.com/examples'), 'https://call4.me/examples');
});

test('machine endpoints keep answering where clients call them', () => {
  assert.equal(to('http://call4.me/mcp'), null);
  assert.equal(to('https://callbay.skeptrune.com/webhooks/telnyx'), null);
  assert.equal(to('http://localhost:8787/'), null);
});
