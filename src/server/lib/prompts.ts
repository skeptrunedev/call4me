/**
 * The text a person pastes into their coding agent. With a key it installs call4me;
 * without one it explains how to get one. The MCP URL carries the key so a single
 * line works in Claude Code, Codex, Claude Desktop, claude.ai, ChatGPT, Grok Bot and grok.com alike.
 * Muse can't add MCP servers, so it builds its own integration and keeps the key in its vault.
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
   - Muse: build a custom integration to the call4me remote MCP server at ${origin}/mcp (streamable HTTP) with the official MCP SDK. Ask me for my call4me API key (it's at ${origin}/account) through your secure credential flow, never in chat, store it in your Secure Credentials Store, and send it as Authorization: Bearer <key>. List the tools, test call4me_get_balance, and save it as a reusable skill.
   - Grok Bot: add a custom MCP server called call4me at ${mcpUrl(origin, key)} (remote HTTPS, no headers, no auth). You add it from this chat; no separate approval is needed.
   - grok.com: you can't add connectors from the chat, so I do it: grok.com/connectors, New Connector, Custom, with the URL ${mcpUrl(origin, key)} (no sign-in needed).
   This URL contains my secret key, so don't paste it anywhere else.`
    : `   - Claude Code:  claude mcp add --scope user --transport http call4me ${origin}/mcp  (then I run /mcp, pick call4me, and choose authenticate)
   - Codex:        codex mcp add call4me --url ${origin}/mcp  then  codex mcp login call4me
   - Claude Desktop, claude.ai, or ChatGPT: add a custom connector with the URL ${origin}/mcp and sign in when it asks.
   - Muse: build a custom integration to the call4me remote MCP server at ${origin}/mcp (streamable HTTP) with the official MCP SDK. Ask me for my call4me API key (it's at ${origin}/account) through your secure credential flow, never in chat, store it in your Secure Credentials Store, and send it as Authorization: Bearer <key>. List the tools, test call4me_get_balance, and save it as a reusable skill.
   - Grok Bot: add a custom MCP server called call4me (remote HTTPS, no headers, no auth) at my personal server URL, which I copy from ${origin}/account. You add it from this chat; no separate approval is needed. If you offer sign-in instead, use ${origin}/mcp and I sign in.
   - grok.com: you can't add connectors from the chat, so I do it: grok.com/connectors, New Connector, Custom, with the URL ${origin}/mcp, then I sign in.
   - If you can't sign me in, I copy my personal server URL from ${origin}/account and you use that instead.
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
- Add credits: call4me_add_funds with amount_dollars (10 to 500). It reloads that amount monthly. Give me the checkout link; nothing is charged until I pay.
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

/** Rules: check a call against them before placing it. */
export function rulesPrompt(origin: string, key: string | null): string {
  return `Help me use call4me within its rules (${origin}/rules).

${connect(origin, key)}

Before placing any call for me with call4me_place_call, check it against the rules page:
- Only businesses and services I want to reach. Never a personal number that isn't expecting the call.
- No telemarketing, surveys, collections, or pretending to be me: the caller calls for me and says so if asked.
- No emergency or premium-rate numbers. US, Canadian and European numbers work, plus countries my account holds a call4me number in (call4me_get_balance lists my numbers).
If something I ask for breaks a rule, tell me which one and don't call. Otherwise check call4me_get_requirements for the category and ask me for anything missing in one message before dialing.`;
}

/** Terms: what a call costs and where the account stands. */
export function termsPrompt(origin: string, key: string | null): string {
  return `Explain how call4me billing works for me (${origin}/terms) and show me where I stand.

${connect(origin, key)}

Call call4me_get_balance and tell me my balance, the price per minute, about how many minutes that is, and my monthly reload if I have one. Then explain in a few lines: a call holds its maximum cost before it dials and settles when it ends; talk time counts from pickup, rounded up to the minute; unanswered, busy and failed calls are free; credits don't expire; the monthly reload can be stopped anytime at ${origin}/account and the credits already loaded stay.`;
}

/** Support: work out what went wrong, then hand off to a person with the details. */
export function supportPrompt(origin: string, key: string | null): string {
  return `Help me sort out a problem with call4me (${origin}/support).

${connect(origin, key)}

- A call went wrong: call4me_list_calls to find it, then call4me_get_call with its call_id for the outcome and transcript. Tell me in a few lines what happened and why it didn't get done, and offer to try again with what was missing.
- Credits or the monthly reload: call4me_get_balance shows the balance, price per minute and reload. The reload is stopped at ${origin}/account.
- Anything that needs a person (a refund, deleting my account, a number that keeps getting called): draft a short email to me@call4.me with the call id and what happened, and show it to me before I send it.`;
}

/** Examples: hear what a call sounds like, then make one. */
export function examplesPrompt(origin: string, key: string | null): string {
  return `I listened to the example calls at ${origin}/examples. Make a call like that for me.

${connect(origin, key)}

1. Ask me what I want done and where (book or cancel a table, ask a business a question, an appointment...).
2. Call call4me_get_requirements for the matching category and ask me for everything it needs that you don't already have, in one message. Find the business's number (web search if needed) and check it's the right location.
3. Place the call with call4me_place_call, show me the calling_number it returns, then keep calling call4me_get_call with wait_seconds until it finishes. Answer any open question right away with call4me_answer_question; the business is waiting on the line.
4. Tell me the result in one or two lines.`;
}

/** Voices: pick the caller voice, then make a call with it. */
export function companiesPrompt(origin: string, key: string | null): string {
  return `I looked at the customer service numbers at ${origin}/companies. Call one of these companies for me.

${connect(origin, key)}

1. Ask me which company and what I need from them. Open its call4me post (linked on that page) for the number and the phone tree path that reached a person.
2. Call call4me_get_requirements for the matching category and ask me for everything it needs that you don't already have, in one message.
3. Place the call with call4me_place_call, put the phone tree path from the post in the goal, show me the calling_number it returns, then keep calling call4me_get_call with wait_seconds until it finishes. Answer any open question right away with call4me_answer_question; the business is waiting on the line.
4. Tell me the result in one or two lines.`;
}

export function voicesPrompt(origin: string, key: string | null): string {
  return `I listened to the caller voices at ${origin}/voices. Use the voice I pick for my calls.

${connect(origin, key)}

1. Ask me which voice I want (marin, cedar, gleam, or meridian) and what call to make.
2. Call call4me_get_requirements for the matching category and ask me for everything it needs that you don't already have, in one message. Find the business's number (web search if needed) and check it's the right location.
3. Place the call with call4me_place_call and the voice I picked, show me the calling_number it returns, then keep calling call4me_get_call with wait_seconds until it finishes. Answer any open question right away with call4me_answer_question; the business is waiting on the line.
4. Tell me the result in one or two lines, and keep using that voice for my calls unless I say otherwise.`;
}

/** The blog: find the post that fits a chore, then do it. */
export function blogPrompt(origin: string, key: string | null): string {
  return `Read the call4me blog (${origin}/blog, every post as markdown in ${origin}/llms.txt) and help me get a phone chore done with call4me.

${connect(origin, key)}

Ask me what I need called for. If a post covers it, use its tips. Then call call4me_get_requirements for the category, ask me in one message for anything missing, place the call with call4me_place_call, follow it with call4me_get_call until it finishes, and tell me the result in one or two lines.`;
}

/** One blog post: do what it describes, for me. */
export function postPrompt(origin: string, key: string | null, slug: string, title: string): string {
  return `Read "${title}" (${origin}/blog/${slug}, send Accept: text/markdown for the markdown) and do what it describes for me with call4me.

${connect(origin, key)}

Ask me for my own details for the call (the business, what I want, which times or prices work for me). Call call4me_get_requirements for the category and ask me in one message for anything it needs that you don't have. Then place the call with call4me_place_call, follow it with call4me_get_call until it finishes (answer open questions right away with call4me_answer_question), and tell me the result in one or two lines.`;
}
