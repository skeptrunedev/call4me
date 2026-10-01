/**
 * The text a person pastes into their coding agent. With a key it installs call4me;
 * without one it explains how to get one. The MCP URL carries the key so a single
 * line works in Claude Code, Codex, Claude Desktop, claude.ai and ChatGPT alike.
 */

export const mcpUrl = (origin: string, key: string) => `${origin}/mcp/${key}`;

/**
 * How to add the server in each client: the key-in-URL line when the page knows the viewer's
 * key (signed in), otherwise the sign-in flow.
 */
function clientSteps(origin: string, key: string | null): string {
  return key
    ? `   - Claude Code:  claude mcp add --scope user --transport http call4me ${mcpUrl(origin, key)}
   - Codex:        codex mcp add call4me --url ${mcpUrl(origin, key)}
   - Claude Desktop, claude.ai, or ChatGPT: add a custom connector with the URL ${mcpUrl(origin, key)} (tell me to do this if you can't).
   This URL contains my secret key, so don't paste it anywhere else.`
    : `   - Claude Code:  claude mcp add --scope user --transport http call4me ${origin}/mcp  (then I run /mcp, pick call4me, and choose authenticate)
   - Codex:        codex mcp add call4me --url ${origin}/mcp  then  codex mcp login call4me
   - Claude Desktop, claude.ai, or ChatGPT: add a custom connector with the URL ${origin}/mcp and sign in when it asks.
   I sign in with Google or X.`;
}

export function installPrompt(origin: string, key: string | null): string {
  const step1 = key
    ? `1. Add the call4me MCP server. Use whichever matches you:
${clientSteps(origin, key)}`
    : `1. Add the call4me MCP server and sign me in. Use whichever matches you:
${clientSteps(origin, null)} If I have no credits yet, I load some at ${origin} (from $10).`;
  return `Set up call4me so you can make phone calls for me (book restaurants, doctor's appointments, call businesses for info).

${step1}

2. Restart or reload MCP servers if needed, then call call4me_get_balance to check it works. Show me my assigned call4me numbers from the returned numbers list, with their countries, and suggest saving them as a contact named call4me. These are the numbers call4me calls from, separate from my own phone saved in my calling profile. If phone_number is null and the numbers list is empty, explain that my free US number is assigned on my first call and you'll show it to me then. Don't invent a number or claim one has already been assigned. Explain that call4me may ring my saved phone when a business needs me to verify my identity. I answer and press 1 to join; pressing * or hanging up hands the call back to the caller. I can also ask to just listen in on a call (listen_in on call4me_place_call, or mode "listen" on call4me_connect_me): nobody hears me, and I press 1 to take over.

3. Set up my calling profile now, so calls never stall on missing details: call call4me_get_profile, then ask me in ONE message for whatever is missing (full legal name as on my ID, date of birth, phone, email, home address, health insurance carrier + member ID + group number or self-pay, dental insurance, my car's year/make/model/mileage/VIN if I have one, frequent flyer numbers and status, and TSA PreCheck/Global Entry Known Traveler Number). Never ask for or save my Social Security number, card numbers, or passwords. Save my answers with call4me_save_profile. Skip anything I decline.

4. From now on, when I ask you to call somewhere:
   - Pick the category and call call4me_get_requirements. Ask me for every required detail you don't already have in one message before dialing (reason for the visit, new or existing patient, which days/times work, party size...). The caller can only say what you give it.
   - Find the number (web search if needed) and make sure it's the right location.
   - Before placing a call with connect_when, give me a heads up that my phone may ring and show the actual call4me number that will ring me. Use the assigned number selected for this call, which can differ by country. If this is my first call and no number is assigned yet, explain that before dialing and show the exact returned calling_number as soon as call4me_place_call returns.
   - Place the call with call4me_place_call. On my first call, or whenever its returned calling_number differs from the one you've already shown me, show me that exact number and suggest saving it as a call4me contact. Then keep calling call4me_get_call until it finishes. If the caller asks a question mid-call, answer it quickly with call4me_answer_question; the business is waiting on the line.
   - Before using call4me_connect_me, give me a heads up with that call's actual calling_number from call4me_get_call. Remind me to answer and press 1 to join, then press * or hang up to hand the call back. Don't use my saved profile phone as the caller number.
   - Tell me the result in one or two lines.`;
}

/** Step zero for the page prompts below: get the tools if this agent doesn't have them yet. */
function connect(origin: string, key: string | null): string {
  return `If you don't have the call4me tools (call4me_*) yet, add the call4me MCP server first${key ? '' : ' and sign me in'}:
${clientSteps(origin, key)}`;
}

/** The sign-in page: connect the agent (it signs in through OAuth) instead of the browser. */
export function signInPrompt(origin: string): string {
  return installPrompt(origin, null);
}

/** My account: everything on the page an agent can do through the tools. */
export function accountPrompt(origin: string, key: string | null): string {
  return `Help me manage my call4me account (${origin}/account).

${connect(origin, key)}

First call call4me_get_balance. Show me any assigned call4me numbers from its numbers list, with their countries, and suggest saving them as a contact named call4me. They are separate from my own phone in my calling profile. If phone_number is null and the list is empty, explain that my free US number is assigned on my first call. Explain that call4me can ring my saved phone if a business needs me to verify my identity: answer and press 1 to join; press * or hang up to hand the call back. Different calls can use different assigned numbers, depending on the country.

Then, depending on what I ask:
- Balance, price per minute, and my call4me phone number: call4me_get_balance.
- My recent calls: call4me_list_calls (outbound calls and callbacks to my number, newest first). For any one, call4me_get_call with its call_id gives the outcome and transcript. Summarize each in one line: who, what for, and the result.
- Add credits: call4me_add_funds with amount_dollars (10 to 500). It reloads that amount monthly unless you pass monthly: false, so ask me which I want. Give me the checkout link; nothing is charged until I pay.
- Stop the monthly reload: call4me_stop_reload, only if I ask. Credits already loaded stay.
- My calling profile (name, date of birth, phone, address, insurance, car): call4me_get_profile to see it, call4me_save_profile to change it (an empty string removes a field).
- Replacing my API key is only done on ${origin}/account (the old one stops working); agents signed in through OAuth don't need one.`;
}

/** One call's page: follow up on that call. */
export function callPrompt(origin: string, key: string | null, callId: string, business: string): string {
  return `Follow up on the call call4me made to ${business} for me (call id ${callId}).

${connect(origin, key)}

1. call4me_get_call with call_id "${callId}" gives the status, outcome, and transcript. If it's still in progress, pass wait_seconds (up to 50) and call again until it finishes. If it lists open_questions, answer each right away with call4me_answer_question; the business is waiting on the line.
2. Tell me the result in one or two lines, and anything I need to do (a confirmation number to note, a time to show up, a callback to expect).
3. If it didn't get done, suggest what to change and offer to call again. Before calling again, check call4me_get_requirements for the category and ask me for anything missing in one message, then place it with call4me_place_call. Before using connect_when, give me a heads up with the actual call4me number selected for the call; if none is assigned yet, explain that it is assigned on the first call and show the exact returned calling_number immediately after placing it. On my first call or when the returned calling_number changes, tell me the number and suggest saving it as a call4me contact.
4. Before call4me_connect_me, give me a heads up with this call's actual calling_number from call4me_get_call. Explain that call4me will ring my own phone so I can speak to the business or verify my identity. I press 1 to join, then press * or hang up to hand the call back.`;
}

/** Privacy: what's stored and how to change it. */
export function privacyPrompt(origin: string, key: string | null): string {
  return `Help me review what call4me stores about me (see ${origin}/privacy).

${connect(origin, key)}

- My saved calling profile: call4me_get_profile. To remove anything, call4me_save_profile with that field set to an empty string; confirm with me first.
- My calls, each with the brief you sent, the outcome, and a transcript: call4me_list_calls, then call4me_get_call for any one.
- Deleting the whole account and its call history is done by email, as the privacy page says; there is no tool for it. Tell me that, and don't try to delete anything else on my behalf.`;
}
