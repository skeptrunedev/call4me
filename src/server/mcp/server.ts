import { McpServer, type CallToolResult, type ToolAnnotations } from '@modelcontextprotocol/server';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker';
import type Stripe from 'stripe';
import { z } from 'zod';
import { formatPhone } from '../lib/phone';
import { accounts, dollars, type Account } from '../services/accounts';
import { ACTIVE, CallError, calls, LIMITS, type CallRow, type Outcome, type Question, type TranscriptLine } from '../services/calls';
import { placeCall, pricePerMinute, VOICES } from '../services/dialer';
import { parseAmountCents, reloadOf, topups, TopupError } from '../services/topups';
import { CATEGORIES, categoryBySlug, CATEGORY_SLUGS, PROFILE_FIELDS, type ProfileKey } from '../services/intake';
import { ProfileError, profiles } from '../services/profiles';

/**
 * The callbay MCP server: the handful of tools a coding agent needs to make a phone call
 * for its user and follow it to the end. Stateless: a fresh server per request.
 */

export const SERVER_NAME = 'callbay';
export const SERVER_VERSION = '1.0.0';

export interface McpDeps {
  env: Env;
  origin: string;
  account: Account;
  /** Built on first use: only the credit tools need Stripe. */
  stripe: () => Stripe;
}

const INSTRUCTIONS = `callbay places real phone calls for the user: doctor/dentist/vet appointments, restaurant bookings, car service and dealership questions, home services, salons, and questions for any business.

The caller can only say what you give it, so everything is collected BEFORE dialing:
1. Once, up front: callbay_get_profile. If it's missing things, ask the user in one message for their full legal name, date of birth, phone, home address, health and dental insurance (carrier + member ID, or self-pay), and car (year/make/model/mileage, VIN) if they have one, and save them with callbay_save_profile. Skip what they decline.
2. For each call: pick the category and call callbay_get_requirements(category). Ask the user for every required field that isn't already known (one message, not one question at a time), plus the per-call details (reason, dates and times that work, party size...).
3. Find the right number (search the web if needed; check it is the right location).
4. callbay_place_call with the category and details. If it answers "Not calling yet", ask the user exactly what it lists and try again.
5. Poll callbay_get_call with wait_seconds until finished. If it shows an open question, the business is waiting on the line: answer right away with callbay_answer_question.
6. Tell the user the outcome in a line or two.

Every call leaves the account's own callbay number as the callback. If a call ends in voicemail or "we'll call you back", callbay remembers the task for 14 days: when the business calls that number back, it answers and finishes the task within the same facts and flexibility, and the result shows on the original call (callbay_get_call lists its callbacks) and in callbay_list_calls.

The caller sounds like a normal person calling for the user. It keeps turns short and does not read the booking back at the end; the recap comes back to you.
Only call businesses and services the user wants to reach, never personal numbers they don't expect a call from.`;

const RO: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const OPEN: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

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
    transcript: transcript.map((l) => `${l.role === 'caller' ? 'caller' : 'them'}: ${l.text}`),
  };
}

function callText(v: ReturnType<typeof callView>): string {
  const lines = [`${v.id} · ${v.status}${v.finished ? '' : v.status === 'completed' ? ' (writing the recap)' : ' (in progress)'} · ${v.business} ${v.number}`];
  if (v.open_questions.length) {
    lines.push('', 'OPEN QUESTION (the business is waiting on the line; answer now with callbay_answer_question):');
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

const callIdArg = z.string().min(1).max(40).describe('the call id from callbay_place_call, e.g. "call_ab12..."');

export function createCallbayServer(deps: McpDeps): McpServer {
  const { env, account } = deps;
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, title: 'callbay', websiteUrl: deps.origin }, { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() });
  const db = calls(env.DB);

  const guard = (fn: () => Promise<CallToolResult>) => async (): Promise<CallToolResult> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CallError || err instanceof TopupError || err instanceof ProfileError) return fail(err.message);
      console.error('mcp tool failed', err);
      return fail('something broke on the server; try again in a moment.');
    }
  };

  server.registerTool(
    'callbay_place_call',
    {
      title: 'Place a phone call',
      description:
        'Call a US or Canadian business for the user and have a natural conversation to get something done (book, reschedule, cancel, ask). Refuses to dial until the category\'s required information is known, and says exactly what to ask the user. Returns right away with a call id; follow it with callbay_get_call. Credits for the maximum length are held up front; billed per minute of talk time; unanswered calls are free.',
      inputSchema: z.object({
        to: z.string().min(3).max(40).describe('the number to call, e.g. "+14155550123" or "(415) 555-0123"'),
        business: z.string().min(1).max(120).describe('who you are calling, as a person would say it: "Nopa", "Dr. Chen\'s office", "Toyota of Berkeley service"'),
        goal: z.string().min(5).max(1500).describe('what the call should achieve, in plain words: "Book a table for 4 tomorrow (Sat Oct 3) around 7pm under Khami."'),
        category: z.enum(CATEGORY_SLUGS).describe('the kind of call; decides what must be known first (see callbay_get_requirements)'),
        details: z.record(z.string(), z.string().max(1000)).optional().describe('answers to the category\'s fields by key, e.g. {"reason":"annual physical","patient_status":"existing","availability":"weekday mornings next week"}. Profile fields (name, DOB, phone, insurance...) are filled from the saved profile unless given here, e.g. to book for a family member.'),
        on_behalf_of: z.string().min(1).max(80).optional().describe('who the call is for, as the caller should say it (default: the profile\'s full_name). The caller calls FOR this person; it never claims to be them.'),
        facts: z.string().max(3000).optional().describe('anything else the caller may share beyond the category\'s fields, one per line'),
        flexibility: z.string().max(1500).optional().describe('what the caller may accept without asking: "any time 6:30-8pm", "a different day this week is fine", "up to $300". Anything outside this becomes a question to you.'),
        timezone: z.string().max(60).optional().describe('IANA time zone of the business, e.g. "America/Los_Angeles", so "tomorrow" is unambiguous'),
        max_minutes: z.number().int().min(1).max(LIMITS.maxMinutes).optional().describe(`hard cap on talk time (default ${LIMITS.defaultMaxMinutes})`),
        voice: z.enum(VOICES).optional().describe('caller voice (default marin)'),
      }),
      annotations: OPEN,
    },
    (async (args: Parameters<typeof placeCall>[3]) =>
      guard(async () => {
        const row = await placeCall(env, deps.origin, account, args);
        const v = callView(row, []);
        return ok(`calling ${v.business} at ${v.number} (${v.id}). Poll callbay_get_call with wait_seconds: 30 until finished, and answer any open question immediately.`, v);
      })()) as never,
  );

  server.registerTool(
    'callbay_get_call',
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
    'callbay_answer_question',
    {
      title: 'Answer the caller\'s question',
      description: 'Answer a question the caller asked mid-call (listed in open_questions). The caller relays it on the line within a second or two. Answer in a few plain words.',
      inputSchema: z.object({ call_id: callIdArg, question_id: z.string().min(1).max(40), answer: z.string().min(1).max(1000).describe('e.g. "Yes, 8:15 works." or "DOB 03/14/1990"') }),
      annotations: { ...OPEN, openWorldHint: false },
    },
    (async (args: { call_id: string; question_id: string; answer: string }) =>
      guard(async () => {
        const q = await db.answer(account.id, args.call_id, args.question_id, args.answer.trim());
        return ok(`sent to the caller: "${q.answer}"`, { id: q.id, question: q.question, answer: q.answer });
      })()) as never,
  );

  server.registerTool(
    'callbay_list_calls',
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
    'callbay_get_balance',
    {
      title: 'Balance and phone number',
      description: 'The prepaid balance, the per-minute price, and the account\'s own callbay phone number (calls go out from it and it is the callback number left on every call; callbacks to it finish the unfinished task or take a message).',
      inputSchema: z.object({}),
      annotations: RO,
    },
    (async () =>
      guard(async () => {
        const balance = await accounts(env.DB).balanceCents(account.id);
        const price = pricePerMinute(env);
        const reload = await reloadOf(env.DB, account.id);
        const number = await env.DB.prepare(`SELECT phone_number FROM accounts WHERE id = ?`).bind(account.id).first<{ phone_number: string | null }>();
        const out = {
          balance: dollars(balance),
          balance_cents: balance,
          price_per_minute: dollars(price),
          minutes_left: Math.floor(balance / price),
          phone_number: number?.phone_number ? formatPhone(number.phone_number) : null,
          email: account.email,
          monthly_reload: reload ? { amount: dollars(reload.cents), status: reload.status, next: reload.renewsAt ? new Date(reload.renewsAt).toISOString().slice(0, 10) : null } : null,
        };
        const reloadText = out.monthly_reload ? `reloads ${out.monthly_reload.amount} monthly${out.monthly_reload.next ? ` (next ${out.monthly_reload.next})` : ''}` : 'no monthly reload';
        return ok(`balance ${out.balance} (~${out.minutes_left} min at ${out.price_per_minute}/min), ${reloadText}. number: ${out.phone_number ?? 'assigned on the first call'}.`, out);
      })()) as never,
  );

  server.registerTool(
    'callbay_get_requirements',
    {
      title: 'What a call needs',
      description: 'The information a kind of call needs before dialing, and which of it the saved profile already has. Without a category, lists the categories.',
      inputSchema: z.object({ category: z.enum(CATEGORY_SLUGS).optional() }),
      annotations: RO,
    },
    (async (args: { category?: string }) =>
      guard(async () => {
        if (!args.category) {
          const text = CATEGORIES.map((c) => `${c.slug}: ${c.name} (${c.examples})`).join('\n');
          return ok(text, { categories: CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, examples: c.examples })) });
        }
        const category = categoryBySlug(args.category)!;
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
          'Pass per-call answers in place_call "details" by key. Missing profile fields: ask once and save with callbay_save_profile.',
        ].join('\n');
        return ok(text, { category: category.slug, fields });
      })()) as never,
  );

  server.registerTool(
    'callbay_get_profile',
    {
      title: 'Saved caller profile',
      description: 'The facts saved for every call (name, DOB, phone, address, insurance, car) and which are still missing.',
      inputSchema: z.object({}),
      annotations: RO,
    },
    (async () =>
      guard(async () => {
        const profile = await profiles(env.DB).get(account.id);
        const missing = (Object.keys(PROFILE_FIELDS) as ProfileKey[]).filter((k) => !profile[k]);
        const text = [
          ...Object.entries(profile).map(([k, v]) => `${k}: ${v}`),
          missing.length ? `missing: ${missing.map((k) => `${k} (${PROFILE_FIELDS[k].ask})`).join('; ')}` : 'complete',
        ].join('\n');
        return ok(text, { profile, missing });
      })()) as never,
  );

  server.registerTool(
    'callbay_save_profile',
    {
      title: 'Save caller profile',
      description: 'Save facts that are the same on every call, so they never have to be asked again. Merges into what is saved; an empty string removes a field. Only save what the user gave you.',
      inputSchema: z.object(Object.fromEntries((Object.keys(PROFILE_FIELDS) as ProfileKey[]).map((k) => [k, z.string().max(500).optional().describe(PROFILE_FIELDS[k].label)]))),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (async (args: Record<string, string | undefined>) =>
      guard(async () => {
        const saved = await profiles(env.DB).update(account.id, Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)) as Record<string, string>);
        return ok(`saved. profile now has: ${Object.keys(saved).join(', ') || 'nothing'}`, { profile: saved });
      })()) as never,
  );

  server.registerTool(
    'callbay_add_funds',
    {
      title: 'Add funds',
      description:
        'A Stripe checkout link that adds credits. By default the same amount reloads every month (replacing any current monthly reload); pass monthly: false for a one-time load. Give the link to the user to open; nothing is charged until they pay.',
      inputSchema: z.object({
        amount_dollars: z.number().min(10).max(500).default(10),
        monthly: z.boolean().default(true).describe('reload this amount every month (default true)'),
      }),
      annotations: { ...OPEN, openWorldHint: false },
    },
    (async (args: { amount_dollars: number; monthly: boolean }) =>
      guard(async () => {
        const url = await topups(env.DB, deps.stripe()).checkout({ amountCents: parseAmountCents(args.amount_dollars), monthly: args.monthly, origin: deps.origin, account });
        return ok(`open this to pay${args.monthly ? ' (reloads monthly; stop anytime)' : ''}: ${url}`, { url, monthly: args.monthly });
      })()) as never,
  );

  server.registerTool(
    'callbay_stop_reload',
    {
      title: 'Stop the monthly reload',
      description: 'Cancel the monthly reload. Credits already loaded stay on the account. Only do this when the user asks.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    (async () =>
      guard(async () => {
        await topups(env.DB, deps.stripe()).stopReload(account.id);
        return ok('monthly reload stopped. credits already loaded stay.', { stopped: true });
      })()) as never,
  );

  return server;
}
