import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPrompt } from '../src/server/lib/prompts';

const origin = 'https://call4.me';

for (const key of [null, 'cb_live_test']) {
  const prompt = installPrompt(origin, key);
  const line = (client: string) => prompt.split('\n').find((l) => l.trim().startsWith(`- ${client}:`)) ?? '';

  test(`Muse builds its own integration with the key in its vault (${key ? 'keyed' : 'keyless'})`, () => {
    const muse = line('Muse');
    assert.match(muse, /secure credential flow/);
    assert.match(muse, /Authorization: Bearer/);
    assert.match(muse, /official MCP SDK/);
    // The key belongs in Muse's vault, never in the chat or the integration's code.
    if (key) assert.ok(!muse.includes(key));
  });

  test(`Grok Bot is told to add a custom MCP server (${key ? 'keyed' : 'keyless'})`, () => {
    const grok = line('Grok Bot');
    assert.match(grok, /custom MCP server/);
    assert.ok(!/Add MCP Server card/.test(prompt));
    if (key) assert.ok(grok.includes(`${origin}/mcp/${key}`));
  });

  test(`grok.com is added by the person, not the chat (${key ? 'keyed' : 'keyless'})`, () => {
    assert.match(line('grok.com'), /grok\.com\/connectors, New Connector, Custom/);
  });
}
