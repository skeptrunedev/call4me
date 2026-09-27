/**
 * The text a person pastes into their coding agent. With a key it installs callbay;
 * without one it explains how to get one. The MCP URL carries the key so a single
 * line works in Claude Code, Codex, Claude Desktop, claude.ai and ChatGPT alike.
 */

export const mcpUrl = (origin: string, key: string) => `${origin}/mcp/${key}`;

export function installPrompt(origin: string, key: string | null): string {
  const step1 = key
    ? `1. Add the callbay MCP server. This URL contains my secret key, so don't paste it anywhere else. Use whichever matches you:
   - Claude Code:  claude mcp add --scope user --transport http callbay ${mcpUrl(origin, key)}
   - Codex:        codex mcp add callbay --url ${mcpUrl(origin, key)}
   - Claude Desktop, claude.ai, or ChatGPT: I'll add a custom connector with the URL ${mcpUrl(origin, key)} (tell me to do this if you can't).`
    : `1. Add the callbay MCP server and sign me in. Use whichever matches you:
   - Claude Code:  claude mcp add --scope user --transport http callbay ${origin}/mcp  (then I run /mcp, pick callbay, and choose authenticate)
   - Codex:        codex mcp add callbay --url ${origin}/mcp  then  codex mcp login callbay
   - Claude Desktop, claude.ai, or ChatGPT: I'll add a custom connector with the URL ${origin}/mcp and sign in when it asks.
   I sign in with Google or X. If I have no credits yet, I load some at ${origin} (from $10).`;
  return `Set up callbay so you can make phone calls for me (book restaurants, doctor's appointments, call businesses for info).

${step1}

2. Restart or reload MCP servers if needed, then call callbay_get_balance to check it works.

3. Set up my calling profile now, so calls never stall on missing details: call callbay_get_profile, then ask me in ONE message for whatever is missing (full legal name as on my ID, date of birth, phone, email, home address, health insurance carrier + member ID + group number or self-pay, dental insurance, my car's year/make/model/mileage/VIN if I have one, frequent flyer numbers and status, and TSA PreCheck/Global Entry Known Traveler Number). Never ask for or save my Social Security number, card numbers, or passwords. Save my answers with callbay_save_profile. Skip anything I decline.

4. From now on, when I ask you to call somewhere:
   - Pick the category and call callbay_get_requirements. Ask me for every required detail you don't already have in one message before dialing (reason for the visit, new or existing patient, which days/times work, party size...). The caller can only say what you give it.
   - Find the number (web search if needed) and make sure it's the right location.
   - Place the call with callbay_place_call, then keep calling callbay_get_call until it finishes. If the caller asks a question mid-call, answer it quickly with callbay_answer_question; the business is waiting on the line.
   - Tell me the result in one or two lines.`;
}
