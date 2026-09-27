import { McpServer, type CallToolResult, type ToolAnnotations } from '@modelcontextprotocol/server';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker';
import type Stripe from 'stripe';
import { z } from 'zod';
import { formatPhone } from '../lib/phone';
import { accounts, dollars, type Account } from '../services/accounts';
import { ACTIVE, CallError, calls, LIMITS, type CallRow, type Outcome, type Question, type TranscriptLine } from '../services/calls';
import { placeCall, pricePerMinute, VOICES } from '../services/dialer';
import { parseAmountCents, topups, TopupError } from '../services/topups';

/**
 * The callbay MCP server: the handful of tools a coding agent needs to make a phone call
 * for its user and follow it to the end. Stateless: a fresh server per request.
 */

export interface McpDeps {
  env: Env;
  origin: string;
  account: Account;
  stripe: Stripe;
}

const INSTRUCTIONS = `callbay places real phone calls for the user: restaurant bookings, doctor/dentist/vet appointments, questions for a car dealership or parts counter, store hours and stock, quotes.

How to use it well:
1. Find the right number (search the web if needed; check it is the right location).
2. Collect everything the caller may need before calling, and ask the user for what's missing: the name the booking goes under, party size, dates and time windows, date of birth and insurance for medical offices, year/make/model/VIN for cars. The caller can only share facts you put in "facts", and can only accept what "flexibility" allows.
3. callbay_place_call, then call callbay_get_call with wait_seconds until the status is final. Calls take 1-5 minutes.
4. If callbay_get_call shows an open question, the business is waiting on the line: answer it right away with callbay_answer_question (ask the user only if you truly don't know).
5. Report the outcome to the user in a line or two.

The caller sounds like a normal person calling on the user's behalf. It keeps turns short and does not read the booking back at the end; the full recap comes back to you in the outcome.
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
export function callView(row: CallRow, questions: Question[]) {
  const outcome = row.outcome ? (JSON.parse(row.outcome) as Outcome) : null;
  const transcript = row.transcript ? (JSON.parse(row.transcript) as TranscriptLine[]) : [];
  return {
    id: row.id,
    status: row.status,
    finished: !ACTIVE.includes(row.status),
    direction: row.direction,
    business: row.business,
    number: formatPhone(row.to_number),
    goal: row.goal,
    outcome,
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
  const lines = [`${v.id} · ${v.status}${v.finished ? '' : ' (in progress)'} · ${v.business} ${v.number}`];
  if (v.open_questions.length) {
    lines.push('', 'OPEN QUESTION (the business is waiting on the line; answer now with callbay_answer_question):');
    for (const q of v.open_questions) lines.push(`- [${q.id}] ${q.question}`);
  }
  if (v.outcome) lines.push('', `outcome: ${v.outcome.result}`, v.outcome.summary, v.outcome.details ? JSON.stringify(v.outcome.details) : '');
  if (v.error) lines.push('', `error: ${v.error}`);
  if (v.finished) lines.push('', `talk time ${v.talk_minutes} min, cost ${v.cost}${v.hangup_cause ? `, ended: ${v.hangup_cause}` : ''}`);
  if (v.transcript.length) lines.push('', 'transcript:', ...v.transcript);
  return lines.join('\n').trim();
}

const callIdArg = z.string().min(1).max(40).describe('the call id from callbay_place_call, e.g. "call_ab12..."');

export function createCallbayServer(deps: McpDeps): McpServer {
  const { env, account } = deps;
  const server = new McpServer({ name: 'callbay', version: '1.0.0', title: 'callbay', websiteUrl: deps.origin }, { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() });
  const db = calls(env.DB);

  const guard = (fn: () => Promise<CallToolResult>) => async (): Promise<CallToolResult> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CallError || err instanceof TopupError) return fail(err.message);
      console.error('mcp tool failed', err);
      return fail('something broke on the server; try again in a moment.');
    }
  };

  server.registerTool(
    'callbay_place_call',
    {
      title: 'Place a phone call',
      description:
        'Call a US or Canadian business for the user and have a natural conversation to get something done (book, reschedule, cancel, ask). Returns right away with a call id; follow it with callbay_get_call. Billed per minute of talk time; unanswered calls are free.',
      inputSchema: z.object({
        to: z.string().min(3).max(40).describe('the number to call, e.g. "+14155550123" or "(415) 555-0123"'),
        business: z.string().min(1).max(120).describe('who you are calling, as a person would say it: "Nopa", "Dr. Chen\'s office", "Toyota of Berkeley service"'),
        goal: z.string().min(5).max(1500).describe('what the call should achieve, in plain words: "Book a table for 4 tomorrow (Sat Oct 3) around 7pm under Khami."'),
        on_behalf_of: z.string().min(1).max(80).describe('the user\'s name as the caller should say it: "Nick Khami". The caller calls FOR this person; it never claims to be them.'),
        facts: z.string().max(3000).optional().describe('everything the caller may share if asked, one per line: name spelling, phone, DOB, insurer and member id, party size, car year/make/model/VIN, prior appointment details'),
        flexibility: z.string().max(1500).optional().describe('what the caller may accept without asking: "any time 6:30-8pm", "a different day this week is fine", "up to $300". Anything outside this becomes a question to you.'),
        callback_number: z.string().max(40).optional().describe('a number the business can call back; defaults to the account\'s own callbay number, which answers and takes messages'),
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
        while (Date.now() < deadline && ACTIVE.includes(row.status) && qs.filter((q) => !q.answer).length <= openAtStart) {
          await new Promise((r) => setTimeout(r, 1500));
          row = await db.forAccount(account.id, args.call_id);
          qs = await db.questions(row.id);
        }
        const v = callView(row, qs);
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
      description: 'Recent calls on this account, newest first, including callbacks the account\'s number answered (direction "inbound") with the message taken.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
      annotations: RO,
    },
    (async (args: { limit: number }) =>
      guard(async () => {
        const rows = await db.list(account.id, args.limit);
        const views = rows.map((r) => callView(r, []));
        const text = views.length
          ? views.map((v) => `${v.id} · ${v.created_at.slice(0, 16).replace('T', ' ')} · ${v.direction} · ${v.status} · ${v.business} ${v.number}${v.outcome ? ` · ${v.outcome.summary}` : ''}`).join('\n')
          : 'no calls yet';
        return ok(text, { calls: views.map((v) => ({ ...v, transcript: undefined })) });
      })()) as never,
  );

  server.registerTool(
    'callbay_get_balance',
    {
      title: 'Balance and phone number',
      description: 'The prepaid balance, the per-minute price, and the account\'s own callbay phone number (calls go out from it; callbacks to it are answered and turned into messages).',
      inputSchema: z.object({}),
      annotations: RO,
    },
    (async () =>
      guard(async () => {
        const balance = await accounts(env.DB).balanceCents(account.id);
        const price = pricePerMinute(env);
        const reload = await topups(env.DB, deps.stripe).reload(account.id);
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
        const url = await topups(env.DB, deps.stripe).checkout({ amountCents: parseAmountCents(args.amount_dollars), monthly: args.monthly, origin: deps.origin, account });
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
        await topups(env.DB, deps.stripe).stopReload(account.id);
        return ok('monthly reload stopped. credits already loaded stay.', { stopped: true });
      })()) as never,
  );

  return server;
}
