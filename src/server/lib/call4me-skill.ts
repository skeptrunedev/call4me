import { CATEGORIES } from '../services/intake';
import { DESTINATION_PRICE_CENTS, UAE_CALLING } from './rates';

/**
 * call4me's own skill: how an agent sets call4me up and places calls with it. Served from the
 * Agent Skills index (/.well-known/agent-skills/), so `npx skills add <site>` teaches the agent
 * the whole flow. The tool names are the MCP server's (mcp/server.ts).
 */
export const CALL4ME_SKILL_NAME = 'call4me';

/** The skill's name before the rename; its old URLs redirect to the new ones. */
export const LEGACY_SKILL_NAME = 'callbay';

export const CALL4ME_SKILL_DESCRIPTION = 'How to install call4me and have it place real phone calls for the user (bookings, appointments, questions for a business) through its MCP server.';

export function call4meSkillMd(site: string, pricePerMinuteCents: number): string {
  const price = `$${(pricePerMinuteCents / 100).toFixed(2)}`;
  const uaePrice = `$${(DESTINATION_PRICE_CENTS.AE / 100).toFixed(2)}`;
  return `---
name: call4me
description: Place real phone calls for the user with call4me (${site}): book restaurants, doctor, dentist, and vet appointments, call dealerships, home internet providers, and airlines, or ask any business a question (US, Canada, Europe and the UAE, or elsewhere from a call4me number in that country). Use when the user asks you to call somewhere, book something by phone, or find something out from a business that has no online way to do it.
---

# call4me

call4me gives you one capability: a phone call. A caller that sounds like a normal person dials the business, has the conversation, asks you mid-call when it needs something it wasn't given, and hands you the outcome and a transcript. Credits are prepaid (from $10); talk time costs ${price} per minute (UAE calls ${uaePrice}), held up front and settled when the call ends; unanswered calls are free.

## Connect

call4me is an MCP server at ${site}/mcp (Streamable HTTP). Every tool acts for a signed-in call4me user.

- Claude Code: \`claude mcp add --scope user --transport http call4me ${site}/mcp\`, then \`/mcp\`, pick call4me, and authenticate.
- Codex: \`codex mcp add call4me --url ${site}/mcp\`, then \`codex mcp login call4me\`.
- Claude Desktop, claude.ai, or ChatGPT: add a custom connector with the URL ${site}/mcp and sign in when it asks.
- Muse: it has no form for adding MCP servers, so build a custom integration to ${site}/mcp (streamable HTTP) with the official MCP SDK. Ask the user for their call4me API key (at ${site}/account) through your secure credential flow, never in chat, store it in your Secure Credentials Store, and send it as \`Authorization: Bearer <key>\`. Test \`call4me_get_balance\` and save it as a reusable skill.
- Grok Bot: add a custom MCP server called call4me at the user's personal server URL \`${site}/mcp/<key>\` (remote HTTPS, no headers, no auth), or \`${site}/mcp\` with sign-in; you add it from the chat, with no separate approval step.
- grok.com: the chat can't add connectors, so the user does it at grok.com/connectors, New Connector, Custom, with ${site}/mcp, and signs in.

The user signs in with Google or X. If they gave you a call4me key instead, use \`${site}/mcp/<key>\` as the URL (the key is a secret; don't paste it anywhere else). No credits yet: they load some at ${site}, or you get a checkout link with \`call4me_add_funds\`. Check the connection with \`call4me_get_balance\`.

Show the user their actual assigned call4me numbers from the returned \`numbers\` list, with their countries, and suggest saving them as a contact named call4me. Those are the numbers call4me calls from and businesses can call back. The user's own \`phone\` saved in their calling profile is where call4me rings them; it is a different number. If \`phone_number\` is null and \`numbers\` is empty, explain that their free US number is assigned on their first call and you will show it then. Never invent a number or promise one has already been assigned. Calls in different countries may use different assigned numbers.

Explain during setup that call4me may ring the user's saved phone if a business needs them to verify their identity or speak directly. They answer and press 1 to join the business call; they press * or hang up to hand the call back to the caller. Give a heads up before arranging to ring them, with the actual call4me number they should recognize.

## Set up the calling profile once

The caller can only say what you give it. Call \`call4me_get_profile\`, then ask the user in ONE message for whatever is missing (full legal name, date of birth, phone, email, home address, health and dental insurance or self-pay, car year/make/model/mileage and VIN, frequent flyer numbers, Known Traveler Number) and save the answers with \`call4me_save_profile\`. Skip what they decline. Never ask for or save a Social Security number, card numbers, or passwords.

## Place a call

1. Pick the category and call \`call4me_get_requirements\` with it. Ask the user for every required field you don't already have in one message (reason, new or existing patient, which days and times work, party size...), not one question at a time.
2. Find the number (search the web if needed) and make sure it is the right location.
3. \`call4me_place_call\` with \`to\`, \`business\`, \`goal\`, \`category\`, and \`details\` (answers by field key). Add \`flexibility\` for what the caller may accept without asking. Before passing \`connect_when\`, give the user a heads up that their phone may ring and show the assigned call4me number selected for this call. If no number is assigned yet, explain before dialing that it is assigned on their first call; show the exact returned \`calling_number\` immediately when the tool returns. On the first call, or whenever \`calling_number\` differs from what you already showed them, tell them that exact number and suggest saving it as a call4me contact. Do not assume \`phone_number\` from the balance is the caller number for every country. If the tool answers "Not calling yet", ask the user exactly what it lists and try again.
4. Poll \`call4me_get_call\` with \`wait_seconds: 30\` until \`finished\`. If it lists \`open_questions\`, the business is waiting on the line: answer right away with \`call4me_answer_question\`.
5. Tell the user the result in a line or two, including anything they need to note (a confirmation number, a time to show up).
6. To put the user on the line: pass \`connect_when\` (e.g. "as soon as a person picks up") to skip a hold, or call \`call4me_connect_me\` mid-call. Before \`call4me_connect_me\`, get the call's actual \`calling_number\` from \`call4me_get_call\` and give a heads up with that number. Their own saved phone rings, and they join by pressing 1; remind them they press * or hang up to hand the call back to the caller. This can be needed when the business requires the account holder to verify their identity. If they'd rather just listen in while the caller handles it, pass \`listen_in: true\` to \`call4me_place_call\` (rings them as soon as the business answers) or \`mode: "listen"\` to \`call4me_connect_me\`: nobody on the call hears them, and they press 1 anytime to take over or hang up to stop listening. Never describe the user's saved profile phone as the number calling them. To end a call early (it's going nowhere, or the user changed their mind), call \`call4me_hang_up\`.
7. Voicemail or "we'll call you back" is not a dead end: the callback number left is the call's \`calling_number\`, and when the business calls it back within 14 days call4me answers and finishes the task. Check \`call4me_get_call\` on the original call later; it lists the callbacks and their outcomes.

Categories:

${CATEGORIES.map((c) => `- \`${c.slug}\`: ${c.name} (${c.examples})`).join('\n')}

## Account

- \`call4me_get_balance\`: balance, price per minute, minutes left, the account's assigned call4me \`numbers\`, and the monthly reload. \`phone_number\` is null when no number is assigned yet. Show the returned numbers and their countries to the user during setup; calls and verification rings use the \`calling_number\` returned for that particular call, and businesses can call it back to finish the unfinished task or leave a message.
- \`call4me_list_calls\`: recent calls, newest first; \`call4me_get_call\` for any one's outcome and transcript.
- \`call4me_add_funds\`: a Stripe checkout link ($10 to $500; reloads that amount monthly). Give the link to the user; nothing is charged until they pay.

## Rules

Only call businesses and services the user wants to reach, never personal numbers that don't expect the call. No telemarketing, surveys, collections, or pretending to be the user: the caller calls for them. US, Canadian and European numbers, ${UAE_CALLING}, plus numbers in other countries the account holds a call4me number in (call4me_list_numbers, call4me_buy_number); no emergency or premium-rate numbers. Full rules: ${site}/rules
`;
}
