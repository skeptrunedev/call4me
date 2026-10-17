import { z } from 'zod';
import { LIMITS } from '../services/calls';
import { VOICES } from '../voice/voices';
import { catalog, PROFILE_FIELDS, type Surface } from '../services/intake';

/** Shared by the MCP call tools, the /api/calls routes and the OpenAPI document. */

/** What a call needs, for placing it now or scheduling it. */
export function placeCallInput(surface: Surface) {
  const agents = surface === 'agents';
  const health = surface !== 'chatgpt';
  return z.object({
    to: z.string().min(3).max(40).describe('the number to call, e.g. "+14155550123", "(415) 555-0123", or abroad with its country code, e.g. "+31 20 123 4567"'),
    business: z.string().min(1).max(120).describe('who you are calling, as a person would say it: "Nopa", "Dr. Chen\'s office", "Toyota of Berkeley service"'),
    goal: z.string().min(5).max(1500).describe('what the call should achieve, in plain words: "Book a table for 4 tomorrow (Sat Oct 3) around 7pm under Khami."'),
    category: z.enum(catalog(surface).slugs).describe('the kind of call; decides what must be known first (see call4me_get_requirements)'),
    details: z.record(z.string(), z.string().max(1000)).optional().describe(`answers to the category's fields by key, e.g. ${health ? '{"reason":"annual physical","patient_status":"existing","availability":"weekday mornings next week"}' : '{"party_size":"4","date":"Sat Oct 3","time_window":"7pm, anything 6:30-8"}'}. Profile fields (${health ? 'name, DOB, phone, insurance' : 'name, phone, address'}...) are filled from the saved profile only when the call is for the profile's owner; for anyone else (on_behalf_of is another name) pass all of their details here, since the owner's are never used.`),
    on_behalf_of: z.string().min(1).max(80).optional().describe('who the call is for, as the caller should say it (default: the profile\'s full_name). The caller calls FOR this person; it never claims to be them.'),
    facts: z.string().max(3000).optional().describe('anything else the caller may share beyond the category\'s fields, one per line'),
    flexibility: z.string().max(1500).optional().describe('what the caller may accept without asking: "any time 6:30-8pm", "a different day this week is fine", "up to $300". Anything outside this becomes a question to you.'),
    timezone: z.string().max(60).optional().describe('IANA time zone of the business, e.g. "America/Los_Angeles", so "tomorrow" is unambiguous'),
    connect_when: z.string().max(300).optional().describe('when to ring the user and patch them into the call without being asked, e.g. "as soon as a person picks up" (skip the hold) or "if they need to speak to me". Rings their own phone: details.phone when given, else the one in their profile; a call with neither is refused. They hand the call back to the caller by pressing * or hanging up.'),
    listen_in: z.boolean().optional().describe('ring the user as soon as the business answers so they can listen in: nobody on the call hears them and the caller keeps working. They press 1 anytime to take over, or hang up to stop listening. Rings their own phone: details.phone when given, else the one in their profile; a call with neither is refused.'),
    max_minutes: z.number().int().min(1).max(LIMITS.maxMinutes).optional().describe(`optional cap on the answered call, including phone menus. Defaults to ${LIMITS.defaultMinutes} minutes, or less if the available balance cannot cover it. Only credits for that cap are held. A call still on hold when it reaches the cap keeps waiting: call4me holds ${LIMITS.holdExtensionMinutes} more minutes of credits at a time while the balance covers them, up to ${LIMITS.maxMinutes / 60} hours. One still mid-conversation at the cap gets ${LIMITS.talkExtensionMinutes} more minutes at a time to finish instead of hanging up. Set a shorter cap to leave more credits free for other calls`),
    voice: z.enum(VOICES).optional().describe('caller voice (default marin); hear each at https://call4.me/voices'),
    caller_name: z.string().max(30).optional().describe('a first name the caller introduces itself with, e.g. "Jordan", for this call only (default: the profile\'s assistant_name, else none: just "<user>\'s assistant"). Put the caller\'s name and company here, never in the goal: the caller\'s identity comes only from these fields.'),
    calling_as: z.string().min(1).max(80).optional().describe('a company the caller calls from, e.g. "Acme": it introduces itself as "Jordan from Acme" (or "calling from Acme" without caller_name) instead of "<user>\'s assistant", and callbacks to the number it called from answer as that company. Calling for several companies: pass the company on every call and give each one its own number (from), so callbacks reach the right identity.'),
    callback_number: z.string().max(40).optional().describe('the number the caller gives for call-backs and on voicemail, when the user wants callbacks to ring a phone of theirs (e.g. "(415) 555-0123"). Default: the number the call comes from, so a call4me number answers the callback and finishes the task. A callback to callback_number goes straight to that phone instead, and call4me never hears it. Phone numbers in details or facts are only for finding or verifying an account, never given as the callback.'),
    from: z.string().max(40).optional().describe(`which of the account's numbers to call from (default: a call4me number in the callee's country)${agents ? '. May be one of the user\'s own verified numbers (call4me_verify_number), for businesses in its country: they see it and call back the user directly' : ''}`),
  });
}

/**
 * POST /api/x402/calls: a call paid for up front in USDC, by an agent with a wallet and no
 * call4me account. The payment buys max_minutes at the destination's per-minute price.
 */
export const x402CallsPath = '/api/x402/calls';
export const X402_CALL_MINUTES = { default: 10, max: 60 };
export const x402CallInput = placeCallInput('agents').extend({
  max_minutes: z
    .number()
    .int()
    .min(1)
    .max(X402_CALL_MINUTES.max)
    .optional()
    .describe(`the most minutes the answered call may run, including phone menus (default ${X402_CALL_MINUTES.default}); the payment is this many minutes at the destination's per-minute price. Minutes the call does not use stay as credits on the paying wallet's call4me account`),
});

export const callAtInput = z.string().min(10).max(40).describe('when to dial: the business\'s local time like "2026-10-05T09:15" together with timezone, or an ISO time with its offset like "2026-10-05T09:15:00-07:00". Pick a time the business is open and answering (a little after opening beats right at it). Up to 60 days ahead; dials within a minute of it.');

export const scheduleCallInput = (surface: Surface) => placeCallInput(surface).extend({ call_at: callAtInput });

export const callIdArg = z.string().min(1).max(40).describe('the call id from call4me_place_call, e.g. "call_ab12..."');
export const followedIdArg = z.string().min(1).max(40).describe('the call id from call4me_place_call ("call_ab12..."), or the scheduled id from call4me_schedule_call ("sched_ab12...")');
export const scheduledIdArg = z.string().min(1).max(40).describe('the id from call4me_schedule_call, e.g. "sched_ab12..."');
export const waitSecondsInput = z.number().int().min(0).max(50).default(0).describe('wait up to this long for the call to finish or ask a question');
export const listLimitInput = z.number().int().min(1).max(50).default(10);

export const connectInput = z.object({
  phone: z.string().max(40).optional().describe('a different number to ring, e.g. "(415) 555-0123"'),
  mode: z.enum(['join', 'listen']).default('join').describe('"join" (default): they take the call over by pressing 1. "listen": they listen in while the caller keeps working, and can press 1 anytime to take over'),
});

export const answerInput = z.object({
  question_id: z.string().min(1).max(40),
  answer: z.string().min(1).max(1000).describe('e.g. "Yes, 8:15 works." or "The reservation is under Khami."'),
});

export const profileInput = (surface: Surface) =>
  z.object(Object.fromEntries(catalog(surface).profileKeys.map((k) => [k, z.string().max(500).optional().describe(PROFILE_FIELDS[k].label)])));

export const balancePath = '/api/balance';
export const requirementsPath = '/api/requirements';
export const categoryRequirementsPath = '/api/requirements/{category}';
export const profilePath = '/api/profile';
export const callsPath = '/api/calls';
export const callPath = '/api/calls/{call_id}';
export const callAnswerPath = '/api/calls/{call_id}/answer';
export const callConnectPath = '/api/calls/{call_id}/connect';
export const callHangUpPath = '/api/calls/{call_id}/hang-up';
export const scheduledCallsPath = '/api/scheduled-calls';
export const scheduledCallPath = '/api/scheduled-calls/{scheduled_id}';

// Output shapes are loose, like the number outputs: a field added later must not break a client.
const outcome = z.looseObject({ result: z.string(), summary: z.string(), details: z.record(z.string(), z.unknown()).optional() });

export const callOutput = z.looseObject({
  id: z.string(),
  status: z.enum(['queued', 'dialing', 'in_progress', 'completed', 'no_answer', 'busy', 'failed', 'canceled']),
  finished: z.boolean().describe('true once the call ended and its recap is written; poll until then'),
  direction: z.enum(['outbound', 'inbound']),
  business: z.string(),
  number: z.string(),
  calling_number: z.string().nullable().describe('the call4me number that rings the user when they join'),
  goal: z.string().nullable(),
  outcome: outcome.nullable(),
  open_questions: z.array(z.looseObject({ id: z.string(), question: z.string() })).describe('the business is waiting on the line: answer right away'),
  answered_questions: z.array(z.looseObject({ question: z.string(), answer: z.string() })),
  talk_minutes: z.number().int(),
  cost: z.string(),
  cost_cents: z.number().int().describe('billed so far, in US cents; final once finished'),
  ended: z.string().nullable().describe('who ended the call and why'),
  error: z.string().nullable(),
  created_at: z.string(),
  transcript: z.array(z.string()).optional(),
});

export const scheduledOutput = z.looseObject({
  id: z.string(),
  status: z.enum(['pending', 'dialing', 'placed', 'failed', 'canceled']),
  business: z.string(),
  number: z.string(),
  call_at: z.string(),
  call_id: z.string().nullable().describe('the call it became, once dialed'),
});

export const balanceOutput = z.looseObject({
  balance: z.string(),
  balance_cents: z.number().int(),
  price_per_minute: z.string(),
  price_per_minute_by_country: z.record(z.string(), z.string()),
  minutes_left: z.number().int(),
  phone_number: z.string().nullable(),
  numbers: z.array(z.looseObject({ number: z.string(), e164: z.string() })),
});

export const requirementsOutput = z.looseObject({
  category: z.string(),
  name: z.string(),
  fields: z.array(z.looseObject({ key: z.string(), label: z.string(), required: z.boolean(), ask: z.string(), from_profile: z.string().nullable(), known: z.boolean() })),
});

export const categoriesOutput = z.looseObject({ categories: z.array(z.looseObject({ slug: z.string(), name: z.string(), examples: z.string() })) });
export const profileOutput = z.looseObject({ profile: z.record(z.string(), z.string()), missing: z.array(z.string()).optional() });
export const callActionOutput = z.looseObject({ call_id: z.string(), message: z.string() });
