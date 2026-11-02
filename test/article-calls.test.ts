import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/server/lib/context';
import { CHATGPT_PLUGIN_URL } from '../src/server/lib/pages';
import { postPrompt } from '../src/server/lib/prompts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent('export class DurableObject {}')}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.md')) return { format: 'module', source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))}`, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { blog } = await import('../src/server/routes/blog');
const app = new Hono<AppEnv>().route('/blog', blog);
const page = async (slug: string) => {
  const response = await app.request(`https://call4.me/blog/${slug}`, { headers: { 'user-agent': 'Googlebot' } });
  assert.equal(response.status, 200);
  return response.text();
};

test('supported articles offer the published plugin and a task brief without placing a call', async () => {
  for (const [slug, business] of [['expedia-customer-service-number', 'Expedia'], ['priceline-customer-service', 'Priceline'], ['booking-com-customer-service-number', 'Booking.com'], ['best-buy-customer-service-number', 'Best Buy'], ['enterprise-customer-service-number', 'Enterprise']]) {
    const html = await page(slug!);
    const action = /<aside class="box"[^>]*>([\s\S]*?)<\/aside>/.exec(html)?.[1];
    assert.ok(action, slug);
    assert.ok(action.includes(`href="${CHATGPT_PLUGIN_URL}"`));
    assert.ok(action.includes(`copy my ${business} call brief`));
    assert.match(action, /href="\/mcp"/);
    assert.match(action, /copying the brief does not place a call/);
    assert.equal((html.match(/id="agent-prompt"/g) ?? []).length, 1);
    assert.match(html, /<audio\b/, 'the recorded evidence stays accessible');
  }
});

test('a restricted account task does not send visitors to the ChatGPT directory plugin', async () => {
  const html = await page('spectrum-retention-department');
  const action = /<aside class="box"[^>]*>([\s\S]*?)<\/aside>/.exec(html)![1]!;
  assert.ok(!action.includes(`href="${CHATGPT_PLUGIN_URL}"`));
  assert.match(action, /does not support existing internet account calls/);
  assert.match(action, /href="\/mcp"/);
  const prompt = postPrompt('https://call4.me', null, 'spectrum-retention-department', 'Spectrum');
  assert.match(prompt, /Do not try to bypass the plugin category restrictions/);
  assert.match(prompt, /Do not request cancellation, add a mobile line or accept a contract without my explicit agreement/);
});

test('support restrictions and reservation secrets are retained in the generated task briefs', async () => {
  for (const slug of ['uber-customer-service-number', 'lyft-customer-service-number', 'stubhub-customer-service-number']) {
    assert.doesNotMatch(await page(slug), /<aside class="box"/);
    const prompt = postPrompt('https://call4.me', null, slug, 'Support');
    assert.match(prompt, /explain the documented alternative instead of placing a call/);
    assert.match(prompt, /tested number only directs callers to another support channel/);
  }
  const booking = postPrompt('https://call4.me', null, 'booking-com-customer-service-number', 'Booking.com');
  assert.match(booking, /Never ask for a reservation PIN, password or account secret in chat/);
  assert.match(booking, /arrange for me to join/);
});
