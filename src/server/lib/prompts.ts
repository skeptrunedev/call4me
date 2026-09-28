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

/** Step zero for the page prompts below: get the tools if this agent doesn't have them yet. */
function connect(origin: string): string {
  return `If you don't have the callbay tools (callbay_*) yet, add the callbay MCP server first and sign me in:
   - Claude Code:  claude mcp add --scope user --transport http callbay ${origin}/mcp  (then run /mcp, pick callbay, and choose authenticate)
   - Codex:        codex mcp add callbay --url ${origin}/mcp  then  codex mcp login callbay
   - Claude Desktop, claude.ai, or ChatGPT: add a custom connector with the URL ${origin}/mcp and sign in when it asks.
   I sign in with Google or X.`;
}

/** The sign-in page: connect the agent (it signs in through OAuth) instead of the browser. */
export function signInPrompt(origin: string): string {
  return installPrompt(origin, null);
}

/** My account: everything on the page an agent can do through the tools. */
export function accountPrompt(origin: string): string {
  return `Help me manage my callbay account (${origin}/account).

${connect(origin)}

Then, depending on what I ask:
- Balance, price per minute, and my callbay phone number: callbay_get_balance.
- My recent calls: callbay_list_calls (outbound calls and callbacks to my number, newest first). For any one, callbay_get_call with its call_id gives the outcome and transcript. Summarize each in one line: who, what for, and the result.
- Add credits: callbay_add_funds with amount_dollars (10 to 500). It reloads that amount monthly unless you pass monthly: false, so ask me which I want. Give me the checkout link; nothing is charged until I pay.
- Stop the monthly reload: callbay_stop_reload, only if I ask. Credits already loaded stay.
- My calling profile (name, date of birth, phone, address, insurance, car): callbay_get_profile to see it, callbay_save_profile to change it (an empty string removes a field).
- A new API key is only issued on ${origin}/account (the old one stops working); agents signed in through OAuth don't need one.`;
}

/** One call's page: follow up on that call. */
export function callPrompt(origin: string, callId: string, business: string): string {
  return `Follow up on the call callbay made to ${business} for me (call id ${callId}).

${connect(origin)}

1. callbay_get_call with call_id "${callId}" gives the status, outcome, and transcript. If it's still in progress, pass wait_seconds (up to 50) and call again until it finishes. If it lists open_questions, answer each right away with callbay_answer_question; the business is waiting on the line.
2. Tell me the result in one or two lines, and anything I need to do (a confirmation number to note, a time to show up, a callback to expect).
3. If it didn't get done, suggest what to change and offer to call again. Before calling again, check callbay_get_requirements for the category and ask me for anything missing in one message, then place it with callbay_place_call.`;
}

/** Privacy: what's stored and how to change it. */
export function privacyPrompt(origin: string): string {
  return `Help me review what callbay stores about me (see ${origin}/privacy).

${connect(origin)}

- My saved calling profile: callbay_get_profile. To remove anything, callbay_save_profile with that field set to an empty string; confirm with me first.
- My calls, each with the brief you sent, the outcome, and a transcript: callbay_list_calls, then callbay_get_call for any one.
- Deleting the whole account and its call history is done by email, as the privacy page says; there is no tool for it. Tell me that, and don't try to delete anything else on my behalf.`;
}
