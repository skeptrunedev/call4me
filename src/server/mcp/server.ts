import { McpServer, type CallToolResult, type ToolAnnotations } from '@modelcontextprotocol/server';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker';
import type Stripe from 'stripe';
import { z } from 'zod';
import { formatPhone } from '../lib/phone';
import { accounts, dollars, type Account } from '../services/accounts';
import { ACTIVE, CallError, calls, LIMITS, type CallRow, type Outcome, type Question, type TranscriptLine } from '../services/calls';
import { placeCall, pricePerMinute, VOICES } from '../services/dialer';
import { parseAmountCents, reloadOf, topups, TopupError } from '../services/topups';
import { checkDialable } from '../lib/phone';
import { sessionFor } from '../voice/session';
import { catalog, PROFILE_FIELDS, type Surface } from '../services/intake';
import { ProfileError, profiles } from '../services/profiles';
import { recordingDescription, recordingInput, recordingOutput } from '../lib/recording-schema';
import { buyNumberDescription, buyNumberInput, listNumbersDescription, numbersOutput, releaseNumberDescription, releaseNumberInput } from '../lib/number-schema';
import { mayCall, NumberError, numbers, type NumberView } from '../services/numbers';
import { getCallRecordings } from '../services/recordings';

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
   * 'chatgpt' is the server listed in the ChatGPT plugin directory, whose rules forbid selling
   * credits or numbers in the chat and collecting restricted data: it leaves out the purchase
   * tools and the categories and profile fields that need health, government-ID or account-secret
   * data (services/intake.ts catalog). Everyone else gets 'agents', the whole server.
   */
  surface?: Surface;
}

function instructions(surface: Surface): string {
  const agents = surface === 'agents';
  return `call4me places real phone calls for the user: ${agents ? 'doctor/dentist/vet appointments' : 'vet appointments'}, restaurant bookings, car service and dealership questions, home services, salons, and questions for any business.

During setup, call call4me_get_balance and show the user their actual call4me numbers. Suggest saving them as a contact named call4me. These are separate from the user's personal phone in call4me_get_profile: call4me may ring that personal phone when a business needs them to verify their account, or when they ask to join a call. Explain that they answer and press 1 to join, and press * or hang up to hand the call back. If phone_number is null and numbers is empty, explain that the free US number is assigned on the first call; never invent a number or buy an extra number for setup.

The caller can only say what you give it, so everything is collected BEFORE dialing:
1. Once, up front: call4me_get_profile. If it's missing things, ask the user in one message for their full legal name, date of birth, phone, home address, ${agents ? 'health and dental insurance (carrier + member ID, or self-pay), ' : ''}and car (year/make/model/mileage, VIN) if they have one, and save them with call4me_save_profile. Skip what they decline.
2. For each call: pick the category and call call4me_get_requirements(category). Ask the user for every required field that isn't already known (one message, not one question at a time), plus the per-call details (reason, dates and times that work, party size...).
3. Find the right number (search the web if needed; check it is the right location).
4. call4me_place_call with the category and details. If it answers "Not calling yet", ask the user exactly what it lists and try again. Show its calling_number so the user knows which call4me number may ring them; suggest saving it if this is their first call or a different number than before. It is the call4me number, not number (the business's number).
5. Poll call4me_get_call with wait_seconds until finished. If it shows an open question, the business is waiting on the line: answer right away with call4me_answer_question.
6. Tell the user the outcome in a line or two.

To put the user on a call themselves: pass connect_when to call4me_place_call (e.g. "as soon as a person picks up", to skip a long hold), or call call4me_connect_me mid-call. Give the user a heads up before placing a call that may ring them, and before call4me_connect_me. Tell them why and use the actual call's calling_number from call4me_get_call; for a new call, use the selected owned number when known and confirm it from the place_call result. If the first number has not been assigned yet, explain that upfront and show it as soon as place_call returns. Their phone rings and they join the call by pressing 1; the caller goes quiet, and takes over again when they press * or hang up. To have them listen in without taking over, pass listen_in: true to call4me_place_call (they hear the call from the moment the business answers) or mode: "listen" to call4me_connect_me: nobody on the call hears them, the caller keeps working, and they press 1 anytime to take over. To end a call early, use call4me_hang_up.

Calls go out from the account's own numbers: its free US number, plus any it bought (${agents ? 'call4me_list_numbers, call4me_buy_number' : 'call4me_get_balance lists them'}). Businesses in the US, Canada and Europe can always be called (Europe from a European number when the account holds one, else from its US number); anywhere else, once the account holds a number in that country, and the call goes out from it.

Every call leaves the calling number as the callback. If a call ends in voicemail or "we'll call you back", call4me remembers the task for 14 days: when the business calls that number back, it answers and finishes the task within the same facts and flexibility, and the result shows on the original call (call4me_get_call lists its callbacks) and in call4me_list_calls.

The caller sounds like a normal person calling for the user. It keeps turns short and does not read the booking back at the end; the recap comes back to you.
Only call businesses and services the user wants to reach, never personal numbers they don't expect a call from.`;
}

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

/** The shape every call tool returns: what an agent needs to decide its next step. */
export function callView(row: CallRow, questions: Question[], callbacks: CallRow[] = []) {
  const outcome = row.outcome ? (JSON.parse(row.outcome) as Outcome) : null;
  const transcript = row.transcript ? (JSON.parse(row.transcript) as TranscriptLine[]) : [];
  // An answered call is finished once its recap is written (seconds after hangup), or if that failed.
  const ended = !ACTIVE.includes(row.status);
  const recapPending = ended && Boolean(row.answered_at) && !outcome && !row.error && Date.now() - (row.ended_at ?? 0) < 60_000;
  return {
    id: row.id,
    status: row.status,
    finished: ended && !recapPending,
    direction: row.direction,
    business: row.business,
    number: formatPhone(row.to_number),
    calling_number: row.from_number ? formatPhone(row.from_number) : null,
    calling_number_e164: row.from_number,
    goal: row.goal,
    outcome,
    callback_for: row.callback_for,
    callbacks: callbacks.map((c) => ({ id: c.id, created_at: new Date(c.created_at).toISOString(), outcome: c.outcome ? (JSON.parse(c.outcome) as Outcome) : null })),
    open_questions: questions.filter((q) => !q.answer).map((q) => ({ id: q.id, question: q.question })),
    answered_questions: questions.filter((q) => q.answer).map((q) => ({ question: q.question, answer: q.answer })),
    talk_minutes: row.billed_seconds ? Math.ceil(row.billed_seconds / 60) : 0,
    cost: dollars(row.cost_cents ?? 0),
    hangup_cause: row.hangup_cause,
    error: row.error,
    created_at: new Date(row.created_at).toISOString(),
    transcript: transcript.map((l) => `${l.role}: ${l.text}`),
  };
}

function callText(v: ReturnType<typeof callView>): string {
  const lines = [`${v.id} · ${v.status}${v.finished ? '' : v.status === 'completed' ? ' (writing the recap)' : ' (in progress)'} · ${v.business} ${v.number}`];
  if (v.calling_number) lines.push(`call4me number: ${v.calling_number} (the number that rings the user when they join)`);
  if (v.open_questions.length) {
    lines.push('', 'OPEN QUESTION (the business is waiting on the line; answer now with call4me_answer_question):');
    for (const q of v.open_questions) lines.push(`- [${q.id}] ${q.question}`);
  }
  if (v.outcome) lines.push('', `outcome: ${v.outcome.result}`, v.outcome.summary, v.outcome.details ? JSON.stringify(v.outcome.details) : '');
  if (v.callback_for) lines.push('', `callback that picked up the unfinished task of ${v.callback_for}`);
  for (const c of v.callbacks) lines.push('', `they called back (${c.id}, ${c.created_at.slice(0, 16).replace('T', ' ')}): ${c.outcome ? `${c.outcome.result}. ${c.outcome.summary}` : 'in progress'}`);
  if (v.error) lines.push('', `error: ${v.error}`);
  if (v.finished) lines.push('', `talk time ${v.talk_minutes} min, cost ${v.cost}${v.hangup_cause ? `, ended: ${v.hangup_cause}` : ''}`);
  if (v.transcript.length) lines.push('', 'transcript:', ...v.transcript);
  return lines.join('\n').trim();
}

const callIdArg = z.string().min(1).max(40).describe('the call id from call4me_place_call, e.g. "call_ab12..."');

export function createCall4meServer(deps: McpDeps): McpServer {
  const { env, account } = deps;
  const surface = deps.surface ?? 'agents';
  const agents = surface === 'agents';
  const intake = catalog(surface);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, title: 'call4me', websiteUrl: deps.origin }, { instructions: instructions(surface), jsonSchemaValidator: new CfWorkerJsonSchemaValidator() });
  const db = calls(env.DB);

  const guard = (fn: () => Promise<CallToolResult>) => async (): Promise<CallToolResult> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CallError || err instanceof TopupError || err instanceof ProfileError || err instanceof NumberError) return fail(err.message);
      console.error('mcp tool failed', err);
      return fail('something broke on the server; try again in a moment.');
    }
  };

  server.registerTool(
    'call4me_get_recordings',
    { title: 'Get call recordings', description: recordingDescription, inputSchema: recordingInput, outputSchema: recordingOutput, annotations: RO },
    (async (args: { call_id: string }) => guard(async () => {
      const result = await getCallRecordings(env, account.id, args.call_id);
      const links = result.recordings.flatMap((r) => Object.entries(r.download_urls).map(([format, url]) => `${r.id} (${format}): ${url}`));
      return ok([result.message, ...links].join('\n'), result);
    })()) as never,
  );

  server.registerTool(
    'call4me_place_call',
    {
      title: 'Place a phone call',
      description:
        'Call a business for the user (US, Canada, Europe, or any other country the account holds a number in; see call4me_list_numbers) and have a natural conversation to get something done (book, reschedule, cancel, ask). Refuses to dial until the category\'s required information is known, and says exactly what to ask the user. Returns right away with a call id; follow it with call4me_get_call. Credits for the maximum length are held up front; billed per minute of talk time; unanswered calls are free.',
      inputSchema: z.object({
        to: z.string().min(3).max(40).describe('the number to call, e.g. "+14155550123", "(415) 555-0123", or abroad with its country code, e.g. "+31 20 123 4567"'),
        business: z.string().min(1).max(120).describe('who you are calling, as a person would say it: "Nopa", "Dr. Chen\'s office", "Toyota of Berkeley service"'),
        goal: z.string().min(5).max(1500).describe('what the call should achieve, in plain words: "Book a table for 4 tomorrow (Sat Oct 3) around 7pm under Khami."'),
        category: z.enum(intake.slugs).describe('the kind of call; decides what must be known first (see call4me_get_requirements)'),
        details: z.record(z.string(), z.string().max(1000)).optional().describe(`answers to the category's fields by key, e.g. ${agents ? '{"reason":"annual physical","patient_status":"existing","availability":"weekday mornings next week"}' : '{"party_size":"4","date":"Sat Oct 3","time_window":"7pm, anything 6:30-8"}'}. Profile fields (${agents ? 'name, DOB, phone, insurance' : 'name, phone, address'}...) are filled from the saved profile only when the call is for the profile's owner; for anyone else (on_behalf_of is another name) pass all of their details here, since the owner's are never used.`),
        on_behalf_of: z.string().min(1).max(80).optional().describe('who the call is for, as the caller should say it (default: the profile\'s full_name). The caller calls FOR this person; it never claims to be them.'),
        facts: z.string().max(3000).optional().describe('anything else the caller may share beyond the category\'s fields, one per line'),
        flexibility: z.string().max(1500).optional().describe('what the caller may accept without asking: "any time 6:30-8pm", "a different day this week is fine", "up to $300". Anything outside this becomes a question to you.'),
        timezone: z.string().max(60).optional().describe('IANA time zone of the business, e.g. "America/Los_Angeles", so "tomorrow" is unambiguous'),
        connect_when: z.string().max(300).optional().describe('when to ring the user and patch them into the call without being asked, e.g. "as soon as a person picks up" (skip the hold) or "if they need to speak to me". Rings the phone in their profile. They hand the call back to the caller by pressing * or hanging up.'),
        listen_in: z.boolean().optional().describe('ring the user as soon as the business answers so they can listen in: nobody on the call hears them and the caller keeps working. They press 1 anytime to take over, or hang up to stop listening. Rings the phone in their profile.'),
        max_minutes: z.number().int().min(1).max(LIMITS.maxMinutes).optional().describe(`hard cap on talk time (default ${LIMITS.defaultMaxMinutes})`),
        voice: z.enum(VOICES).optional().describe('caller voice (default marin)'),
        from: z.string().max(40).optional().describe('which of the account\'s numbers to call from (default: one in the callee\'s country)'),
      }),
      annotations: DIALS,
    },
    (async (args: Parameters<typeof placeCall>[3]) =>
      guard(async () => {
        const row = await placeCall(env, deps.origin, account, args, surface);
        const v = callView(row, []);
        return ok(`calling ${v.business} at ${v.number} (${v.id}). Your call4me number is ${v.calling_number}; show it to the user so they recognize a call if they need to join. Poll call4me_get_call with wait_seconds: 30 until finished, and answer any open question immediately.`, v);
      })()) as never,
  );

  server.registerTool(
    'call4me_get_call',
    {
      title: 'Check on a call',
      description:
        'Status, open questions, live transcript, and (when finished) the outcome of a call. With wait_seconds it waits for something to change (a new question, the call ending) before returning, so poll with wait_seconds: 30.',
      inputSchema: z.object({ call_id: callIdArg, wait_seconds: z.number().int().min(0).max(50).default(0).describe('wait up to this long for the call to finish or ask a question') }),
      annotations: RO,
    },
    (async (args: { call_id: string; wait_seconds: number }) =>
      guard(async () => {
        const deadline = Date.now() + args.wait_seconds * 1000;
        let row = await db.forAccount(account.id, args.call_id);
        let qs = await db.questions(row.id);
        const openAtStart = qs.filter((q) => !q.answer).length;
        while (Date.now() < deadline && !callView(row, qs).finished && qs.filter((q) => !q.answer).length <= openAtStart) {
          await new Promise((r) => setTimeout(r, 1500));
          row = await db.forAccount(account.id, args.call_id);
          qs = await db.questions(row.id);
        }
        const v = callView(row, qs, await db.callbacksFor(row.id));
        return ok(callText(v), v);
      })()) as never,
  );

  server.registerTool(
    'call4me_connect_me',
    {
      title: 'Patch the user into a live call',
      description:
        'Ring the user now and patch them into a call in progress, so they talk to the business directly while the caller goes quiet. Before calling this tool, give the user a heads up with the reason and calling_number from call4me_get_call. Rings the phone in their profile unless phone is given; they join by pressing 1 when they pick up (a voicemail never gets patched in). When they press * or hang up, the caller takes the call back and carries on with the task. With mode "listen" they only listen in: nobody on the call hears them, the caller keeps working, and they press 1 anytime to take over or hang up to stop listening.',
      inputSchema: z.object({
        call_id: callIdArg,
        phone: z.string().max(40).optional().describe('a different number to ring, e.g. "(415) 555-0123"'),
        mode: z.enum(['join', 'listen']).default('join').describe('"join" (default): they take the call over by pressing 1. "listen": they listen in while the caller keeps working, and can press 1 anytime to take over'),
      }),
      annotations: OPEN,
    },
    (async (args: { call_id: string; phone?: string; mode: 'join' | 'listen' }) =>
      guard(async () => {
        const row = await db.forAccount(account.id, args.call_id);
        if (!ACTIVE.includes(row.status) || !row.answered_at) throw new CallError('the call is not live');
        let phone: string | undefined;
        if (args.phone) {
          const p = checkDialable(args.phone);
          if (!p.ok) throw new CallError(`phone: ${p.reason}`);
          if (!(await mayCall(env.DB, account.id, p))) throw new CallError(`phone: calling ${p.country} needs a number there (call4me_buy_number)`);
          phone = p.e164;
        }
        const res = await sessionFor(env, row.id).fetch('https://session/connect-person', { method: 'POST', body: JSON.stringify({ phone, mode: args.mode }) });
        const { message } = (await res.json()) as { message: string };
        return ok(message, { call_id: row.id, message });
      })()) as never,
  );

  server.registerTool(
    'call4me_hang_up',
    {
      title: 'Hang up a live call',
      description: 'End a call in progress now, e.g. when it is going nowhere or the user changed their mind. Talk time so far is billed as usual; call4me_get_call shows the final state.',
      inputSchema: z.object({ call_id: callIdArg }),
      annotations: { ...OPEN, destructiveHint: true },
    },
    (async (args: { call_id: string }) =>
      guard(async () => {
        const row = await db.forAccount(account.id, args.call_id);
        if (!ACTIVE.includes(row.status)) throw new CallError('the call is not live');
        const res = await sessionFor(env, row.id).fetch('https://session/hang-up', { method: 'POST' });
        const { message } = (await res.json()) as { message: string };
        return ok(message, { call_id: row.id, message });
      })()) as never,
  );

  server.registerTool(
    'call4me_answer_question',
    {
      title: 'Answer the caller\'s question',
      description: 'Answer a question the caller asked mid-call (listed in open_questions). The caller relays it on the line within a second or two. Answer in a few plain words.',
      inputSchema: z.object({ call_id: callIdArg, question_id: z.string().min(1).max(40), answer: z.string().min(1).max(1000).describe('e.g. "Yes, 8:15 works." or "DOB 03/14/1990"') }),
      annotations: { ...OPEN, openWorldHint: false },
    },
    (async (args: { call_id: string; question_id: string; answer: string }) =>
      guard(async () => {
        const q = await db.answer(account.id, args.call_id, args.question_id, args.answer.trim());
        await sessionFor(env, args.call_id).fetch('https://session/answer', { method: 'POST', body: JSON.stringify({ id: q.id, question: q.question, answer: q.answer }) });
        return ok(`sent to the caller: "${q.answer}"`, { id: q.id, question: q.question, answer: q.answer });
      })()) as never,
  );

  server.registerTool(
    'call4me_list_calls',
    {
      title: 'List recent calls',
      description: 'Recent calls on this account, newest first, including callbacks the account\'s number answered (direction "inbound"): a callback about an unfinished task (callback_for) tried to finish it, anything else took a message.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
      annotations: RO,
    },
    (async (args: { limit: number }) =>
      guard(async () => {
        const rows = await db.list(account.id, args.limit);
        const views = rows.map((r) => callView(r, []));
        const text = views.length
          ? views.map((v) => `${v.id} · ${v.created_at.slice(0, 16).replace('T', ' ')} · ${v.direction} · ${v.status} · ${v.business} ${v.number}${v.callback_for ? ` · callback for ${v.callback_for}` : ''}${v.outcome ? ` · ${v.outcome.summary}` : ''}`).join('\n')
          : 'no calls yet';
        return ok(text, { calls: views.map((v) => ({ ...v, transcript: undefined })) });
      })()) as never,
  );

  server.registerTool(
    'call4me_get_balance',
    {
      title: 'Balance and phone numbers',
      description: 'The prepaid balance, the per-minute price, and the account\'s own call4me phone numbers. During setup, show these numbers and suggest saving them as a contact named call4me. Call4me can ring the user\'s personal phone for account verification or to join a call, from that call\'s calling_number. The free US number is assigned on the first call; a null phone_number is normal before then. Callbacks to the calling number finish the unfinished task or take a message.',
      inputSchema: z.object({}),
      annotations: RO,
    },
    (async () =>
      guard(async () => {
        const balance = await accounts(env.DB).balanceCents(account.id);
        const price = pricePerMinute(env);
        const reload = await reloadOf(env.DB, account.id);
        const owned = await numbers(env).views(account.id);
        const out = {
          balance: dollars(balance),
          balance_cents: balance,
          price_per_minute: dollars(price),
          minutes_left: Math.floor(balance / price),
          phone_number: owned[0]?.number ?? null,
          numbers: owned,
          email: account.email,
          monthly_reload: reload ? { amount: dollars(reload.cents), status: reload.status, next: reload.renewsAt ? new Date(reload.renewsAt).toISOString().slice(0, 10) : null } : null,
        };
        const reloadText = out.monthly_reload ? `reloads ${out.monthly_reload.amount} monthly${out.monthly_reload.next ? ` (next ${out.monthly_reload.next})` : ''}` : 'no monthly reload';
        return ok(`balance ${out.balance} (~${out.minutes_left} min at ${out.price_per_minute}/min), ${reloadText}. ${owned.length ? `numbers: ${owned.map(numberText).join('; ')}. Show these to the user and suggest saving them as a contact named call4me` : 'number: assigned on the first call. Explain this during setup, then show calling_number from the first call result'}. Call4me may ring the personal phone in the user's profile if a business needs account verification or the user asks to join. Answer and press 1 to join; press * or hang up to hand the call back. They can also just listen in (listen_in on call4me_place_call, or mode "listen" on call4me_connect_me) and press 1 to take over. Give a heads up before a call that may ring them and before connecting them.`, out);
      })()) as never,
  );

  server.registerTool(
    'call4me_get_requirements',
    {
      title: 'What a call needs',
      description: 'The information a kind of call needs before dialing, and which of it the saved profile already has. Without a category, lists the categories.',
      inputSchema: z.object({ category: z.enum(intake.slugs).optional() }),
      annotations: RO,
    },
    (async (args: { category?: string }) =>
      guard(async () => {
        if (!args.category) {
          const text = intake.categories.map((c) => `${c.slug}: ${c.name} (${c.examples})`).join('\n');
          return ok(text, { categories: intake.categories.map((c) => ({ slug: c.slug, name: c.name, examples: c.examples })) });
        }
        const category = intake.bySlug(args.category)!;
        const profile = await profiles(env.DB).get(account.id);
        const fields = category.fields.map((f) => ({
          key: f.key,
          label: f.label,
          required: f.required,
          ask: f.ask,
          from_profile: f.profile ?? null,
          known: Boolean(f.profile && profile[f.profile]),
        }));
        const text = [
          `${category.name}. Before calling, make sure you have:`,
          ...fields.map((f) => `- ${f.key}${f.required ? '' : ' (optional)'}: ${f.known ? `have it (profile ${f.from_profile})` : f.ask}`),
          'Pass per-call answers in place_call "details" by key. Missing profile fields: ask once and save with call4me_save_profile.',
        ].join('\n');
        return ok(text, { category: category.slug, fields });
      })()) as never,
  );

  server.registerTool(
    'call4me_get_profile',
    {
      title: 'Saved caller profile',
      description: `The facts saved for every call (name, DOB, phone, address, ${agents ? 'insurance, ' : ''}car) and which are still missing.`,
      inputSchema: z.object({}),
      annotations: RO,
    },
    (async () =>
      guard(async () => {
        const saved = await profiles(env.DB).get(account.id);
        const profile = Object.fromEntries(intake.profileKeys.filter((k) => saved[k]).map((k) => [k, saved[k]]));
        const missing = intake.profileKeys.filter((k) => !profile[k]);
        const text = [
          ...Object.entries(profile).map(([k, v]) => `${k}: ${v}`),
          missing.length ? `missing: ${missing.map((k) => `${k} (${PROFILE_FIELDS[k].ask})`).join('; ')}` : 'complete',
        ].join('\n');
        return ok(text, { profile, missing });
      })()) as never,
  );

  server.registerTool(
    'call4me_save_profile',
    {
      title: 'Save caller profile',
      description: 'Save facts that are the same on every call, so they never have to be asked again. Merges into what is saved; an empty string removes a field. Only save what the user gave you.',
      inputSchema: z.object(Object.fromEntries(intake.profileKeys.map((k) => [k, z.string().max(500).optional().describe(PROFILE_FIELDS[k].label)]))),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (async (args: Record<string, string | undefined>) =>
      guard(async () => {
        const saved = await profiles(env.DB).update(account.id, Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)) as Record<string, string>);
        const shown = Object.fromEntries(intake.profileKeys.filter((k) => saved[k]).map((k) => [k, saved[k]]));
        return ok(`saved. profile now has: ${Object.keys(shown).join(', ') || 'nothing'}`, { profile: shown });
      })()) as never,
  );

  if (agents) registerPurchaseTools(server, deps, guard);

  return server;
}

/** Buying credits and numbers, and managing numbers: not in the ChatGPT directory server (see McpDeps.surface). */
function registerPurchaseTools(server: McpServer, deps: McpDeps, guard: (fn: () => Promise<CallToolResult>) => () => Promise<CallToolResult>) {
  const { env, account } = deps;

  server.registerTool(
    'call4me_add_funds',
    {
      title: 'Add funds',
      description:
        'A Stripe checkout link that adds credits now and reloads the same amount every month (replacing any current monthly reload). Give the link to the user to open; nothing is charged until they pay.',
      inputSchema: z.object({
        amount_dollars: z.number().min(10).max(500).default(10),
      }),
      annotations: { ...OPEN, openWorldHint: false },
    },
    (async (args: { amount_dollars: number }) =>
      guard(async () => {
        const url = await topups(env.DB, deps.stripe()).checkout({ amountCents: parseAmountCents(args.amount_dollars), monthly: true, origin: deps.origin, account });
        return ok(`open this to pay (reloads monthly): ${url}`, { url, monthly: true });
      })()) as never,
  );

  server.registerTool(
    'call4me_list_numbers',
    { title: 'Phone numbers', description: listNumbersDescription, inputSchema: z.object({}), outputSchema: numbersOutput, annotations: { ...RO, openWorldHint: true } },
    (async () =>
      guard(async () => {
        const n = numbers(env);
        const [owned, countries] = await Promise.all([n.views(account.id), n.offers()]);
        const text = [
          owned.length ? `your numbers:\n${owned.map((v) => `- ${numberText(v)}`).join('\n')}` : 'no numbers yet: the free US number is bought on the first call.',
          `countries (price today, then monthly):\n${countries.map((c) => `- ${c.country} ${c.name} (${c.type}): ${c.available ? `${c.price}, then ${c.monthly}/month` : c.reason}`).join('\n')}`,
        ].join('\n\n');
        return ok(text, { numbers: owned, countries });
      })()) as never,
  );

  server.registerTool(
    'call4me_buy_number',
    { title: 'Buy a phone number', description: buyNumberDescription, inputSchema: buyNumberInput, annotations: OPEN },
    (async (args: { country: string; area_code?: string }) =>
      guard(async () => {
        const bought = await numbers(env).buy(account, { country: args.country, areaCode: args.area_code });
        const balance = await accounts(env.DB).balanceCents(account.id);
        return ok(`bought ${numberText(bought)}. balance ${dollars(balance)}.`, { number: bought, balance: dollars(balance) });
      })()) as never,
  );

  server.registerTool(
    'call4me_release_number',
    { title: 'Release a phone number', description: releaseNumberDescription, inputSchema: releaseNumberInput, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } },
    (async (args: { number: string }) =>
      guard(async () => {
        const released = await numbers(env).release(account, args.number);
        return ok(`released ${released.number}; its monthly charge has stopped.`, { released });
      })()) as never,
  );
}

function numberText(v: NumberView): string {
  const billing = v.included ? 'free' : v.overdue ? `renewal overdue, released after ${v.release_after} unless credits are added` : `${v.monthly}/month, renews ${v.renews}`;
  return `${v.number} (${v.country_name} ${v.type}, ${billing})`;
}
