/**
 * The text a person pastes into their coding agent. With a key it installs callbay;
 * without one it explains how to get one. The MCP URL carries the key so a single
 * line works in Claude Code, Codex, Claude Desktop, claude.ai and ChatGPT alike.
 */

export const mcpUrl = (origin: string, key: string) => `${origin}/mcp/${key}`;

export function installPrompt(origin: string, key: string | null): string {
  const url = key ? mcpUrl(origin, key) : `${origin}/mcp/<YOUR_CALLBAY_KEY>`;
  return `Set up callbay so you can make phone calls for me (book restaurants, doctor's appointments, call businesses for info).

1. Add the callbay MCP server. Use whichever matches you:
   - Claude Code:  claude mcp add --scope user --transport http callbay ${url}
   - Codex:        codex mcp add callbay --url ${url}
   - Claude Desktop, claude.ai, or ChatGPT: I'll add a custom connector with the URL ${url} (tell me to do this if you can't).
   The URL contains my secret key. Don't paste it anywhere else.${key ? '' : `\n   I don't have a key yet: get one at ${origin} (prepaid, from $20).`}

2. Restart or reload MCP servers if needed, then call callbay_get_balance to check it works.

3. From now on, when I ask you to call somewhere:
   - Find the number (web search if needed) and make sure it's the right location.
   - Gather what the caller may need to say: my name as it should be given, party size, dates, times I can do, DOB or insurance for medical offices, car details, a callback number. Ask me for anything missing before calling, since the caller can only share what you give it.
   - Place the call with callbay_place_call, then keep calling callbay_get_call until it finishes. If the caller asks a question mid-call, answer it quickly with callbay_answer_question; the business is waiting on the line.
   - Tell me the result in one or two lines.`;
}
