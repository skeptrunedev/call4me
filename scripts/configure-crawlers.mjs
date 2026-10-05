#!/usr/bin/env node
/** Audit the committed crawler policy; --apply updates Cloudflare and verifies it. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply')) throw new Error('usage: npm run crawlers -- [--apply]');
const apply = args.includes('--apply');
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
const policy = JSON.parse(readFileSync(new URL('../cloudflare.crawlers.json', import.meta.url), 'utf8'));

async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(`${method} ${path}: HTTP ${response.status}, ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

const zones = await api(`/zones?name=${encodeURIComponent(policy.zone)}`);
assert.equal(zones.length, 1, 'Expected exactly one matching Cloudflare zone');
const base = `/zones/${zones[0].id}`;

// Independent controls are reported separately; inaccessible controls fail the command.
const results = await Promise.allSettled([
  (async () => {
    for (const [name, expected] of Object.entries(policy.settings)) {
      const path = `${base}/settings/${name}`;
      const before = await api(path);
      if (apply && before.value !== expected) await api(path, 'PATCH', { value: expected });
      const after = apply ? await api(path) : before;
      console.log(`${name}: ${JSON.stringify(after.value)}`);
      assert.equal(after.value, expected, `${name} must be ${expected}`);
    }
  })(),
  (async () => {
    const path = `${base}/bot_management`;
    const before = await api(path);
    const expected = { ...policy.bot_management };
    // SBFM settings are plan specific. Only set them when Cloudflare reports them.
    for (const name of ['sbfm_definitely_automated', 'sbfm_likely_automated', 'sbfm_verified_bots']) {
      if (name in before) expected[name] = 'allow';
    }
    if ('sbfm_static_resource_protection' in before) expected.sbfm_static_resource_protection = false;
    if (apply) await api(path, 'PUT', expected);
    const after = apply ? await api(path) : before;
    console.log(`bot_management: ${JSON.stringify(after)}`);
    for (const [name, value] of Object.entries(expected)) {
      assert.equal(after[name], value, `${name} does not match the crawler policy`);
    }
    for (const [name, value] of Object.entries(after.stale_zone_configuration ?? {})) {
      assert.ok(value === false || value === 'allow' || value === 'disabled' || value === 'off', `Stale protection ${name}: ${value}`);
    }
  })(),
]);
for (const result of results) {
  if (result.status === 'rejected') {
    console.error(result.reason.message);
    process.exitCode = 1;
  }
}
