import { describe, expect, it } from 'vitest';
import { newApiKey, sealKey, unsealKey } from '../src/server/lib/keys';
import { accountPrompt, callPrompt, installPrompt, mcpUrl, privacyPrompt } from '../src/server/lib/prompts';

describe('sealed keys', () => {
  it('round-trips under the same secret', async () => {
    const key = newApiKey();
    expect(await unsealKey('s3cret', await sealKey('s3cret', key))).toBe(key);
  });
  it('is unreadable under another secret', async () => {
    expect(await unsealKey('other', await sealKey('s3cret', newApiKey()))).toBeNull();
  });
  it('rejects malformed values', async () => expect(await unsealKey('s3cret', 'nope')).toBeNull());
});

describe('copy prompts', () => {
  const origin = 'https://call4.me';
  const key = 'cb_live_abcdefghjkmnpqrstuvwxyz2345678';
  const prompts = (k: string | null) => [installPrompt(origin, k), accountPrompt(origin, k), callPrompt(origin, k, 'call_1', 'Nopa'), privacyPrompt(origin, k)];

  it("carry the signed-in viewer's key in the MCP URL", () => {
    for (const p of prompts(key)) {
      expect(p).toContain(`claude mcp add --scope user --transport http callbay ${mcpUrl(origin, key)}`);
      expect(p).toContain(`codex mcp add callbay --url ${mcpUrl(origin, key)}`);
      expect(p).not.toContain('codex mcp login');
    }
  });
  it('sign in through OAuth without one', () => {
    for (const p of prompts(null)) {
      expect(p).toContain(`${origin}/mcp  then  codex mcp login callbay`);
      expect(p).not.toContain('cb_live_');
    }
  });
});
