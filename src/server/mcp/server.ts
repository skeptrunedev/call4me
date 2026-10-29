import { McpServer, type CallToolResult, type ToolAnnotations } from '@modelcontextprotocol/server';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker';
import type Stripe from 'stripe';
import { z } from 'zod';
import { accounts, dollars, type Account } from '../services/accounts';
import { CallError } from '../services/calls';
import { answerQuestion, balanceView, categoriesView, connectPerson, followCall, followedView, hangUp, listCalls, profileView, requirementsView, saveProfile, callView, type CallView } from '../services/call-ops';
import { placeCall, pricePerMinute, pricePerMinuteTo } from '../services/dialer';
import { DESTINATION_PRICE_CENTS, ABROAD_CALLING } from '../lib/rates';
import { parseAmountCents, topups, TopupError } from '../services/topups';
import { catalog, type Surface } from '../services/intake';
import { ProfileError } from '../services/profiles';
import { answerInput, callAtInput, callIdArg, connectInput, followedIdArg, listLimitInput, placeCallInput, profileInput, scheduledIdArg, waitSecondsInput } from '../lib/call-schema';
import { recordingDescription, recordingInput, recordingOutput } from '../lib/recording-schema';
import { buyNumberDescription, buyNumberInput, listNumbersDescription, numbersOutput, ownNumberInput, releaseNumberDescription, releaseNumberInput, removeOwnNumberDescription, verifyNumberDescription, verifyNumberInput } from '../lib/number-schema';
import { NumberError, numbers, type NumberView, type OwnNumberView, type PendingNumberView } from '../services/numbers';
import { getCallRecordings } from '../services/recordings';
import { scheduledCalls, scheduledText, scheduledView, type ScheduledInput } from '../services/scheduled';

/**
 * The call4me MCP server: the handful of tools a coding agent needs to make a phone call
 * for its user and follow it to the end. Stateless: a fresh server per request.
 */

export const SERVER_NAME = 'call4me';
export const SERVER_VERSION = '1.0.0';

/**
 * The tools were named callbay_* before the rename. Agents with a saved skill or prompt still
 * call those names, so a tools/call for callbay_X is served as call4me_X (see
 * withCurrentToolNames); tools/list only ever shows the call4me_* names.
 */
const LEGACY_TOOL_PREFIX = 'callbay_';
const TOOL_PREFIX = 'call4me_';

export const currentToolName = (name: string): string => (name.startsWith(LEGACY_TOOL_PREFIX) ? TOOL_PREFIX + name.slice(LEGACY_TOOL_PREFIX.length) : name);

/**
 * The MCP request with any legacy tool name in a tools/call renamed. The SDK has no unlisted
 * tools (tools/list shows every enabled tool, tools/call refuses disabled ones), so the name is
 * rewritten before the request reaches it. Anything that isn't a JSON-RPC POST passes through.
 */
export async function withCurrentToolNames(req: Request): Promise<Request> {
  if (req.method !== 'POST') return req;
  let body: unknown;
  try {
    body = JSON.parse(await req.clone().text());
  } catch {
    return req; // the SDK answers the parse error
  }
  let renamed = false;
  const rename = (m: unknown): unknown => {
    const msg = m as { method?: unknown; params?: { name?: unknown } } | null;
    if (msg?.method !== 'tools/call' || typeof msg.params?.name !== 'string' || currentToolName(msg.params.name) === msg.params.name) return m;
    renamed = true;
    return { ...msg, params: { ...msg.params, name: currentToolName(msg.params.name) } };
  };
  const next = Array.isArray(body) ? body.map(rename) : rename(body);
  if (!renamed) return req;
  const headers = new Headers(req.headers);
  headers.delete('content-length');
  return new Request(req.url, { method: req.method, headers, body: JSON.stringify(next), signal: req.signal });
}

export interface McpDeps {
  env: Env;
  origin: string;
  account: Account;
  /** Built on first use: only the credit tools need Stripe. */
  stripe: () => Stripe;
  /**
   * 'chatgpt' and 'claude' are the servers listed in those app directories, whose rules forbid
   * selling credits or numbers in the chat and executing purchases for the user: they leave out
   * the purchase tools. ChatGPT's also forbids collecting restricted data, so 'chatgpt' leaves out
   * the categories and profile fields that need health, government-ID or account-secret data
   * (services/intake.ts catalog). Everyone else gets 'agents', the whole server.
   */
  surface?: Surface;
}

function instructions(surface: Surface): string {
  const agents = surface === 'agents';
  const health = surface !== 'chatgpt';
  return `call4me places real phone calls for the user: ${health ? 'doctor/dentist/vet appointments' : 'vet appointments'}, restaurant bookings, car service and dealership questions, home services, salons, and questions for any business.

During setup, call call4me_get_balance and show the user their actual call4me numbers. Ask them to save the numbers as a contact named call4me. Saving it matters: phones that screen unknown callers (Pixel Call Screen, iPhone's Silence Unknown Callers, carrier spam filters) answer for the user, and the screener gets patched into the business call instead of them; a saved contact rings straight through. These are separate from the user's personal phone in call4me_get_profile: call4me may ring that personal phone when a business needs them to verify their account, or when they ask to join a call. Explain that they're on the call as soon as they answer, and press * or hang up to hand the call back. If phone_number is null and numbers is empty, explain that the free US number is assigned on the first call; never invent a number or buy an extra number for setup.

The caller can only say what you give it, so everything is collected BEFORE dialing:
1. Ask what the user wants done first. Do not collect a personal profile during setup. For a specific call, call4me_get_profile shows what is already saved; collect only what that call needs, as listed in step 2, and explain why any sensitive detail is needed. Giving a detail for one call does not mean saving it: offer call4me_save_profile for details the user wants reused and save only with their agreement. Skip anything the user declines.
2. For each call: pick the category and call call4me_get_requirements(category). Ask the user for every required field that isn't already known (one message, not one question at a time), plus the per-call details (reason, dates and times that work, party size...).
3. Find the right number (search the web if needed; check it is the right location).
4. call4me_place_call with the category and details. If it answers "Not calling yet", ask the user exactly what it lists and try again. Show its calling_number so the user knows which call4me number may ring them; if this is their first call or a different number than before, ask them to save it as a contact before the call can ring them, so call screening lets it through. It is the call4me number, not number (the business's number).
5. Poll call4me_get_call with wait_seconds until finished. If it shows an open question, the business is waiting on the line: answer right away with call4me_answer_question.
6. Tell the user the outcome in a line or two.

To put the user on a call themselves: pass connect_when to call4me_place_call (e.g. "as soon as a person picks up", so the user does not have to listen to a long hold; hold time is still billed, at half the call rate), or call call4me_connect_me mid-call. Give the user a heads up before placing a call that may ring them, and before call4me_connect_me. Tell them why and use the actual call's calling_number from call4me_get_call; for a new call, use the selected owned number when known and confirm it from the place_call result. If the first number has not been assigned yet, explain that upfront and show it as soon as place_call returns. Their phone rings from that number (it should be saved as a contact, or call screening may answer in their place) and they are on the call as soon as they answer; the caller goes quiet, and takes over again when they press * or hang up. To have them listen in without taking over, pass listen_in: true to call4me_place_call (they hear the call from the moment the business answers) or mode: "listen" to call4me_connect_me: nobody on the call hears them, the caller keeps working, and they press 1 anytime to take over. To end a call early, use call4me_hang_up.

To make a call later (the business is closed now, or the user wants it at a set time), gather everything the same way and use call4me_schedule_call with call_at in the business's hours. It is checked now and dialed then, when nobody may be following it, so give it every fact and all the flexibility it needs. If an unexpected question cannot be answered, the caller acknowledges the missing detail and continues with permitted alternatives instead of waiting for a live reply. Tell the user when it will dial. call4me_list_calls shows what is scheduled, call4me_get_call with its sched_ id shows how it went, and call4me_cancel_scheduled_call calls it off.

Calls go out from the account's own numbers: its free US number, plus any it bought (${agents ? 'call4me_list_numbers, call4me_buy_number' : 'call4me_get_balance lists them'}). Businesses in the US, Canada and Europe can always be called (Europe from a European number when the account holds one, else from its US number), and ${ABROAD_CALLING}; anywhere else, once the account holds a number in that country, and the call goes out from it. Check ${agents ? 'call4me_list_numbers' : 'call4me_get_balance'} for current calling rates.

${agents ? `The user can also call from their own phone number: verify it once with call4me_verify_number (the carrier texts it a code; ask the user for it), then pass it as from to call4me_place_call. Only when the user asks for it; it is never picked on its own. Businesses in its country see the user's number, and callbacks ring the user's phone instead of call4me; call4me still rings the user from the call's calling_number when they join.

` : ''}Every call leaves the number the business saw as the callback, unless callback_number names another one (the user's mobile, an assistant's line): then callbacks ring that phone and call4me can't pick them up. If a call ends in voicemail or "we'll call you back", call4me remembers the task for 14 days: when the business calls a call4me number back, it answers and finishes the task within the same facts and flexibility, and the result shows on the original call (call4me_get_call lists its callbacks) and in call4me_list_calls.

The caller sounds like a normal person calling for the user. It keeps turns short and does not read the booking back at the end; the recap comes back to you.
Only call businesses and services the user wants to reach, never personal numbers they don't expect a call from.`;
}

/**
 * Directory metadata belongs on every tool, including read-only tools: the HTTP endpoint
 * requires authentication for all of them. The SDK serializes the documented _meta mirror
 * of securitySchemes (but drops unknown top-level fields). Claude reads titles in annotations.
 */
const titled = <C extends { title: string; annotations?: ToolAnnotations; _meta?: Record<string, unknown> }>(config: C): C => ({
  ...config,
  annotations: { ...config.annotations, title: config.title },
  _meta: { ...config._meta, securitySchemes: [{ type: 'oauth2', scopes: ['calls'] }] },
});

const RO: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const OPEN: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
/** Dialing a business can't be taken back: hosts that confirm irreversible actions ask the user first. */
const DIALS: ToolAnnotations = { ...OPEN, destructiveHint: true };

function ok(text: string, structured: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent: structured };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function callText(v: CallView): string {
  const lines = [`${v.id} · ${v.status}${v.finished ? '' : v.status === 'completed' ? ' (writing the recap)' : ' (in progress)'} · ${v.business} ${v.number}`];
  if (v.own_number) lines.push(`called from the user's own number ${v.own_number}: the business saw it, and callbacks go to their phone`);
  if (v.calling_number) lines.push(`call4me number: ${v.calling_number} (the number that rings the user when they join)`);
  if (v.open_questions.length) {
    lines.push('', 'OPEN QUESTION (the business is waiting on the line; answer now with call4me_answer_question):');
    for (const q of v.open_questions) lines.push(`- [${q.id}] ${q.question}`);
  }
  if (v.outcome) lines.push('', `outcome: ${v.outcome.result}`, v.outcome.summary, v.outcome.details ? JSON.stringify(v.outcome.details) : '');
  if (v.callback_for) lines.push('', `callback that picked up the unfinished task of ${v.callback_for}`);
  for (const c of v.callbacks) lines.push('', `they called back (${c.id}, ${c.created_at.slice(0, 16).replace('T', ' ')}): ${c.outcome ? `${c.outcome.result}. ${c.outcome.summary}` : 'in progress'}`);
  if (v.error) lines.push('', `error: ${v.error}`);
  if (v.finished) lines.push('', `billed time ${v.talk_minutes} min (including phone menus, and hold time at half price), cost ${v.cost}${v.ended ? `, ended: ${v.ended}` : ''}`);
  if (v.transcript.length) lines.push('', 'transcript:', ...v.transcript);
  return lines.join('\n').trim();
}

export function createCall4meServer(deps: McpDeps): McpServer {
  const { env, account } = deps;
  const surface = deps.surface ?? 'agents';
  const agents = surface === 'agents';
  const health = surface !== 'chatgpt';
  const intake = catalog(surface);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, title: 'call4me', websiteUrl: deps.origin }, { instructions: instructions(surface), jsonSchemaValidator: new CfWorkerJsonSchemaValidator() });
  const sched = scheduledCalls(env.DB);

  const guard = (fn: () => Promise<CallToolResult>) => async (): Promise<CallToolResult> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CallError || err instanceof TopupError || err instanceof ProfileError || err instanceof NumberError) return fail(err.message);
      console.error('mcp tool failed', err);
      return fail('something broke on the server; try again in a moment.');
    }
  };

  const placeInput = placeCallInput(surface);

  server.registerTool(
    'call4me_get_recordings',
    titled({ title: 'Get call recordings', description: recordingDescription, inputSchema: recordingInput, outputSchema: recordingOutput, annotations: RO }),
    (async (args: { call_id: string }) => guard(async () => {
      const result = await getCallRecordings(env, account.id, args.call_id);
      const links = result.recordings.flatMap((r) => Object.entries(r.download_urls).map(([format, url]) => `${r.id} (${format}): ${url}`));
      return ok([result.message, ...links].join('\n'), result);
    })()) as never,
  );

  server.registerTool(
    'call4me_place_call',
    titled({
      title: 'Place a phone call',
      description:
        `Call a business for the user (US, Canada, Europe, the UAE and Japan, or any other country the account holds a number in, prices vary by destination; see ${agents ? 'call4me_list_numbers' : 'call4me_get_balance'} for current calling rates) and have a natural conversation to get something done (book, reschedule, cancel, ask). Refuses to dial until the category's required information is known, and says exactly what to ask the user. Returns right away with a call id; follow it with call4me_get_call. Credits for the maximum length are held up front; billed from pickup by a person or automated system, including phone menus, hold time, and conversation at the same rate, rounded up to the minute; unanswered calls are free.`,
      inputSchema: placeInput,
      annotations: DIALS,
    }),
    (async (args: Parameters<typeof placeCall>[3]) =>
      guard(async () => {
        const row = await placeCall(env, deps.origin, account, args, surface);
        const v = callView(row, []);
        return ok(`calling ${v.business} at ${v.number} (${v.id}), ${dollars(pricePerMinuteTo(env, row.to_number))}/min from pickup, including phone menus; hold time is half price.${v.own_number ? ` It shows the user's own number ${v.own_number}, so callbacks go straight to their phone.` : ''} Your call4me number is ${v.calling_number}; show it to the user and ask them to save it as a contact if they haven't, so call screening doesn't answer in their place if they need to join. Poll call4me_get_call with wait_seconds: 30 until finished, and answer any open question immediately.`, v);
      })()) as never,
  );

  server.registerTool(
    'call4me_schedule_call',
    titled({
      title: 'Schedule a phone call',
      description:
        'Place a call later instead of now: when the business is closed, or the user wants it made at a set time ("call Canby Utility Monday morning to register the meters"). Takes everything call4me_place_call takes, plus call_at, and checks it the same way now, so "Not calling yet" comes back while the user is here. At call_at, call4me places it exactly as call4me_place_call would: credits are held then, not now. Nobody may be following the call when it runs, so give the caller every fact (details, facts) and everything it may accept (flexibility) up front; a question nobody answers ends with the caller saying the user will call back. Returns a scheduled id (sched_...): call4me_get_call with it shows whether it dialed and then the call itself, and call4me_cancel_scheduled_call cancels it before it dials. A call that needs an account PIN can\'t be scheduled, since call4me never stores one.',
      inputSchema: placeInput.extend({ call_at: callAtInput }),
      annotations: DIALS,
    }),
    (async (args: ScheduledInput & { call_at: string }) =>
      guard(async () => {
        const { call_at, ...input } = args;
        const v = scheduledView(await sched.schedule(account, input, call_at, surface));
        return ok(`scheduled ${v.id}: call4me calls ${v.business} at ${v.number} ${v.call_at_local ?? v.call_at} (${v.call_at}). Tell the user when it will happen. Check on it with call4me_get_call ${v.id}; cancel with call4me_cancel_scheduled_call.`, v);
      })()) as never,
  );

  server.registerTool(
    'call4me_cancel_scheduled_call',
    titled({
      title: 'Cancel a scheduled call',
      description: 'Cancel a call made with call4me_schedule_call before it dials. Once it has dialed, it is a live call: end it with call4me_hang_up.',
      inputSchema: z.object({ scheduled_id: scheduledIdArg }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }),
    (async (args: { scheduled_id: string }) =>
      guard(async () => {
        const v = scheduledView(await sched.cancel(account.id, args.scheduled_id));
        return ok(scheduledText(v), v);
      })()) as never,
  );

  server.registerTool(
    'call4me_get_call',
    titled({
      title: 'Check on a call',
      description:
        'Status, open questions, live transcript, and (when finished) the outcome of a call. With wait_seconds it waits for something to change (a new question, the call ending) before returning, so poll with wait_seconds: 30. Takes a scheduled id (sched_...) too: before it dials, when it will; after, the call it became.',
      inputSchema: z.object({ call_id: followedIdArg, wait_seconds: waitSecondsInput }),
      annotations: RO,
    }),
    (async (args: { call_id: string; wait_seconds: number }) =>
      guard(async () => {
        const followed = await followCall(env, account.id, args.call_id, args.wait_seconds);
        const { scheduled, call } = followed;
        const text = call ? (scheduled ? `${scheduledText(scheduled)}\n\n${callText(call)}` : callText(call)) : scheduledText(scheduled!);
        return ok(text, followedView(followed));
      })()) as never,
  );

  server.registerTool(
    'call4me_connect_me',
    titled({
      title: 'Patch the user into a live call',
      description:
        'Ring the user now and patch them into a call in progress, so they talk to the business directly while the caller goes quiet. Before calling this tool, give the user a heads up with the reason and calling_number from call4me_get_call, and make sure that number is saved as a contact: a phone that screens unknown callers answers in their place, and the screener is put on the call. Rings their own phone (details.phone from placing the call, else the one in their profile) unless phone is given; they are on the call as soon as they pick up. When they press * or hang up, the caller takes the call back and carries on with the task. With mode "listen" they only listen in: nobody on the call hears them, the caller keeps working, and they press 1 anytime to take over or hang up to stop listening.',
      inputSchema: connectInput.extend({ call_id: callIdArg }),
      annotations: OPEN,
    }),
    (async (args: { call_id: string; phone?: string; mode: 'join' | 'listen' }) =>
      guard(async () => {
        const connected = await connectPerson(env, account.id, args.call_id, args);
        return ok(connected.message, connected);
      })()) as never,
  );

  server.registerTool(
    'call4me_hang_up',
    titled({
      title: 'Hang up a live call',
      description: 'End a call in progress now, e.g. when it is going nowhere or the user changed their mind. Talk time so far is billed as usual; call4me_get_call shows the final state.',
      inputSchema: z.object({ call_id: callIdArg }),
      annotations: { ...OPEN, destructiveHint: true },
    }),
    (async (args: { call_id: string }) =>
      guard(async () => {
        const ended = await hangUp(env, account.id, args.call_id);
        return ok(ended.message, ended);
      })()) as never,
  );

  server.registerTool(
    'call4me_answer_question',
    titled({
      title: 'Answer the caller\'s question',
      description: 'Answer a question the caller asked mid-call (listed in open_questions). The caller relays it on the line within a second or two. Answer in a few plain words.',
      inputSchema: answerInput.extend({ call_id: callIdArg }),
      annotations: OPEN,
    }),
    (async (args: { call_id: string; question_id: string; answer: string }) =>
      guard(async () => {
        const q = await answerQuestion(env, account.id, args.call_id, args.question_id, args.answer);
        return ok(`sent to the caller: "${q.answer}"`, q);
      })()) as never,
  );

  server.registerTool(
    'call4me_list_calls',
    titled({
      title: 'List recent calls',
      description: 'Recent calls on this account, newest first, including callbacks the account\'s number answered (direction "inbound"): a callback about an unfinished task (callback_for) tried to finish it, anything else took a message. Calls scheduled for later (call4me_schedule_call) that have not dialed yet come first.',
      inputSchema: z.object({ limit: listLimitInput }),
      annotations: RO,
    }),
    (async (args: { limit: number }) =>
      guard(async () => {
        const { calls: views, scheduled } = await listCalls(env, account.id, args.limit);
        const lines = [
          ...scheduled.map(scheduledText),
          ...views.map((v) => `${v.id} · ${v.created_at.slice(0, 16).replace('T', ' ')} · ${v.direction} · ${v.status} · ${v.business} ${v.number}${v.callback_for ? ` · callback for ${v.callback_for}` : ''}${v.outcome ? ` · ${v.outcome.summary}` : ''}`),
        ];
        return ok(lines.join('\n') || 'no calls yet', { calls: views.map((v) => ({ ...v, transcript: undefined })), ...(scheduled.length ? { scheduled } : {}) });
      })()) as never,
  );

  server.registerTool(
    'call4me_get_balance',
    titled({
      title: 'Balance and phone numbers',
      description: 'The prepaid balance, the per-minute price, and the account\'s own call4me phone numbers. During setup, show these numbers and ask the user to save them as a contact named call4me, so phones that screen unknown callers let call4me ring through. Call4me can ring the user\'s personal phone for account verification or to join a call, from that call\'s calling_number. The free US number is assigned on the first call; a null phone_number is normal before then. Callbacks to the calling number finish the unfinished task or take a message.',
      inputSchema: z.object({}),
      annotations: RO,
    }),
    (async () =>
      guard(async () => {
        const out = await balanceView(env, account);
        const owned = out.numbers;
        const reloadText = out.monthly_reload ? `reloads ${out.monthly_reload.amount} monthly${out.monthly_reload.next ? ` (next ${out.monthly_reload.next})` : ''}` : 'no monthly reload';
        return ok(`balance ${out.balance} (~${out.minutes_left} min at ${out.price_per_minute}/min; UAE calls ${out.price_per_minute_by_country.AE}/min, Japan ${out.price_per_minute_by_country.JP}/min), ${reloadText}. ${owned.length ? `numbers: ${owned.map(numberText).join('; ')}. Show these to the user and suggest saving them as a contact named call4me` : 'number: assigned on the first call. Explain this during setup, then show calling_number from the first call result'}. Call4me may ring the personal phone in the user's profile if a business needs account verification or the user asks to join. They are on the call as soon as they answer; press * or hang up to hand the call back. They can also just listen in (listen_in on call4me_place_call, or mode "listen" on call4me_connect_me) and press 1 to take over. Give a heads up before a call that may ring them and before connecting them.`, out);
      })()) as never,
  );

  server.registerTool(
    'call4me_get_requirements',
    titled({
      title: 'What a call needs',
      description: 'The information a kind of call needs before dialing, and which of it the saved profile already has. Without a category, lists the categories.',
      inputSchema: z.object({ category: z.enum(intake.slugs).optional() }),
      annotations: RO,
    }),
    (async (args: { category?: string }) =>
      guard(async () => {
        if (!args.category) {
          const listed = categoriesView(intake);
          return ok(listed.categories.map((c) => `${c.slug}: ${c.name} (${c.examples})`).join('\n'), listed);
        }
        const needs = await requirementsView(env, intake, account.id, args.category);
        const text = [
          `${needs.name}. Before calling, make sure you have:`,
          ...needs.fields.map((f) => `- ${f.key}${f.required ? '' : ' (optional)'}: ${f.known ? `have it (profile ${f.from_profile})` : f.ask}`),
          "Pass answers for this call in place_call \"details\" by key. Ask only for missing details this call needs. Offer to save reusable details with call4me_save_profile only with the user's agreement.",
        ].join('\n');
        return ok(text, needs);
      })()) as never,
  );

  server.registerTool(
    'call4me_get_profile',
    titled({
      title: 'Saved caller profile',
      description: `Saved details available to reuse for relevant calls (name, DOB, phone, address, ${health ? 'insurance, ' : ''}car). An incomplete profile is fine. Only request missing details that a specific call needs.`,
      inputSchema: z.object({}),
      annotations: RO,
    }),
    (async () =>
      guard(async () => {
        const { profile, missing } = await profileView(env, intake, account.id);
        const text = [
          ...Object.entries(profile).map(([k, v]) => `${k}: ${v}`),
          missing.length ? `not saved: ${missing.join(', ')}. These are not setup requirements. Only ask for details needed by a specific call, using call4me_get_requirements.` : 'complete',
        ].join('\n');
        return ok(text, { profile, missing });
      })()) as never,
  );

  server.registerTool(
    'call4me_save_profile',
    titled({
      title: 'Save caller profile',
      description: 'Save facts that are the same on every call, so they never have to be asked again. Merges into what is saved; an empty string removes a field. Only save details the user agreed to keep for future calls; use place_call details for information supplied for one call. The user can see, edit and delete everything saved on their call4me account page.',
      inputSchema: profileInput(surface),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }),
    (async (args: Record<string, string | undefined>) =>
      guard(async () => {
        const saved = await saveProfile(env, intake, account.id, args);
        return ok(`saved. profile now has: ${Object.keys(saved.profile).join(', ') || 'nothing'}`, saved);
      })()) as never,
  );

  if (agents) registerPurchaseTools(server, deps, guard);

  return server;
}

/** Buying credits and numbers, and managing numbers: not in the app directories' server (see McpDeps.surface). */
function registerPurchaseTools(server: McpServer, deps: McpDeps, guard: (fn: () => Promise<CallToolResult>) => () => Promise<CallToolResult>) {
  const { env, account } = deps;

  server.registerTool(
    'call4me_add_funds',
    titled({
      title: 'Add funds',
      description:
        'A Stripe checkout link that adds credits now and reloads the same amount every month (replacing any current monthly reload). Give the link to the user to open; nothing is charged until they pay.',
      inputSchema: z.object({
        amount_dollars: z.number().min(10).max(500).default(10),
      }),
      annotations: { ...OPEN, openWorldHint: false },
    }),
    (async (args: { amount_dollars: number }) =>
      guard(async () => {
        const url = await topups(env.DB, deps.stripe()).checkout({ amountCents: parseAmountCents(args.amount_dollars), monthly: true, origin: deps.origin, account });
        return ok(`open this to pay (reloads monthly): ${url}`, { url, monthly: true });
      })()) as never,
  );

  server.registerTool(
    'call4me_list_numbers',
    titled({ title: 'Phone numbers', description: listNumbersDescription, inputSchema: z.object({}), outputSchema: numbersOutput, annotations: { ...RO, openWorldHint: true } }),
    (async () =>
      guard(async () => {
        const n = numbers(env);
        const [owned, pending, own, countries] = await Promise.all([n.views(account.id), n.pendingViews(account.id), n.ownViews(account.id), n.offers()]);
        const text = [
          owned.length ? `your numbers:\n${owned.map((v) => `- ${numberText(v)}`).join('\n')}` : 'no numbers yet: the free US number is bought on the first call.',
          ...(pending.length ? [`paid for, waiting on the carrier's approval (they activate by themselves and can't place calls until then):\n${pending.map((v) => `- ${pendingText(v)}`).join('\n')}`] : []),
          ...(own.length ? [`the user's own numbers (calls use one only when from names it):\n${own.map((v) => `- ${ownNumberText(v)}`).join('\n')}`] : []),
          `calling rates: ${dollars(pricePerMinute(env))}/min unless noted; ${Object.entries(DESTINATION_PRICE_CENTS).map(([country, cents]) => `${country} ${dollars(cents)}/min`).join(', ')}.`,
          `countries (number price today, then monthly; calls there cost ${dollars(pricePerMinute(env))}/min unless noted):\n${countries.map((c) => `- ${c.country} ${c.name} (${c.type}): ${c.available ? `${c.price}, then ${c.monthly}/month${DESTINATION_PRICE_CENTS[c.country] ? `; calls ${dollars(DESTINATION_PRICE_CENTS[c.country]!)}/min` : ''}` : c.reason}`).join('\n')}`,
        ].join('\n\n');
        // Without own or pending numbers, exactly the shape clients cached before either existed.
        return ok(text, { numbers: owned, ...(pending.length ? { pending_numbers: pending } : {}), ...(own.length ? { own_numbers: own } : {}), countries });
      })()) as never,
  );

  server.registerTool(
    'call4me_buy_number',
    titled({ title: 'Buy a phone number', description: buyNumberDescription, inputSchema: buyNumberInput, annotations: OPEN }),
    (async (args: { country: string; area_code?: string }) =>
      guard(async () => {
        const bought = await numbers(env).buy(account, { country: args.country, areaCode: args.area_code });
        const balance = await accounts(env.DB).balanceCents(account.id);
        if (bought.pending) {
          return ok(
            `bought ${pendingText(bought.pending)}. The carrier reviews numbers in ${bought.pending.country_name} before they go live, which can take from minutes to a few days; it activates by itself and its first month starts then. Calls to ${bought.pending.country_name} can go out once call4me_list_numbers shows it under numbers. Tell the user it's ordered and waiting on approval, not ready yet. balance ${dollars(balance)}.`,
            { pending: bought.pending, balance: dollars(balance) },
          );
        }
        return ok(`bought ${numberText(bought.number)}. balance ${dollars(balance)}.`, { number: bought.number, balance: dollars(balance) });
      })()) as never,
  );

  server.registerTool(
    'call4me_release_number',
    titled({ title: 'Release a phone number', description: releaseNumberDescription, inputSchema: releaseNumberInput, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } }),
    (async (args: { number: string }) =>
      guard(async () => {
        const released = await numbers(env).release(account, args.number);
        return ok(`released ${released.number}; its monthly charge has stopped.`, { released });
      })()) as never,
  );

  server.registerTool(
    'call4me_verify_number',
    titled({ title: 'Call from your own number', description: verifyNumberDescription, inputSchema: verifyNumberInput, annotations: OPEN }),
    (async (args: { number: string; code?: string; method: 'sms' | 'call'; extension?: string }) =>
      guard(async () => {
        const n = numbers(env);
        if (args.code) {
          const verified = await n.confirmVerification(account, args.number, args.code);
          return ok(`verified ${verified.number}. Calls go out from it when call4me_place_call has from: "${verified.e164}"; businesses see it and call back the user's phone directly.`, { number: verified });
        }
        const pending = await n.startVerification(account, { number: args.number, method: args.method, extension: args.extension });
        return ok(`${pending.method === 'sms' ? 'texted' : 'calling'} ${pending.number} with a code. Ask the user for it, then call call4me_verify_number again with the same number and code.`, { number: pending });
      })()) as never,
  );

  server.registerTool(
    'call4me_remove_own_number',
    titled({ title: 'Stop calling from your own number', description: removeOwnNumberDescription, inputSchema: ownNumberInput, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } }),
    (async (args: { number: string }) =>
      guard(async () => {
        const removed = await numbers(env).removeOwn(account, args.number);
        return ok(`removed ${removed.number}; calls no longer go out from it.`, { removed });
      })()) as never,
  );
}

function ownNumberText(v: OwnNumberView): string {
  return `${v.number} (${v.country_name}, ${v.status === 'verified' ? 'verified' : `waiting on the ${v.method === 'sms' ? 'texted' : 'called'} code`})`;
}

function pendingText(v: PendingNumberView): string {
  return `${v.number} (${v.country_name} ${v.type}, ${v.monthly}/month once active, ordered ${v.ordered})`;
}

function numberText(v: NumberView): string {
  const billing = v.included ? 'free' : v.overdue ? `renewal overdue, released after ${v.release_after} unless credits are added` : `${v.monthly}/month, renews ${v.renews}`;
  return `${v.number} (${v.country_name} ${v.type}, ${billing})`;
}
