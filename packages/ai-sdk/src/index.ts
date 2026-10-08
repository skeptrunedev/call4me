import { tool } from 'ai';
import { z } from 'zod';

/** The call4me remote MCP server. Every tool here is a thin call to one of its tools. */
const DEFAULT_URL = 'https://call4.me/mcp';

/** The kinds of call call4me knows; each decides what must be known before it dials (see getRequirements). */
const CATEGORIES = [
  'medical',
  'dental',
  'restaurant',
  'veterinary',
  'auto_service',
  'auto_sales',
  'home_service',
  'personal_care',
  'internet_new_service',
  'internet_existing_account',
  'flight_change',
  'general',
] as const;

export interface Call4meOptions {
  /** A call4me API key (cb_live_...). Defaults to process.env.CALL4ME_API_KEY. Get one at https://call4.me. */
  apiKey?: string;
  /** Override the MCP endpoint, e.g. for a local dev server. */
  baseUrl?: string;
  /** How long makePhoneCall waits for the call to finish or ask a question before handing back the call id. Default 15 minutes. */
  maxWaitMinutes?: number;
  /** Custom fetch, e.g. for tests or proxies. */
  fetch?: typeof fetch;
}

/** What a call4me tool returns: its readable summary plus the structured result when the server sends one. */
export interface Call4meResult {
  text: string;
  isError: boolean;
  data?: Record<string, unknown>;
}

export class Call4meError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'Call4meError';
  }
}

interface CallView {
  finished?: boolean;
  open_questions?: unknown[];
}

/** One JSON-RPC tools/call against the call4me MCP endpoint (Streamable HTTP, JSON or SSE response). */
export function createCall4meClient(options: Call4meOptions = {}) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const apiKey = options.apiKey ?? env?.CALL4ME_API_KEY;
  if (!apiKey) throw new Call4meError('Missing call4me API key: pass apiKey or set CALL4ME_API_KEY (get one at https://call4.me).');
  const url = options.baseUrl ?? DEFAULT_URL;
  const doFetch = options.fetch ?? fetch;
  let id = 0;

  return async function callTool(name: string, args: Record<string, unknown>): Promise<Call4meResult> {
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }),
    });
    const body = await res.text();
    if (!res.ok) throw new Call4meError(`call4me ${name} failed with HTTP ${res.status}: ${body.slice(0, 300)}`, res.status);
    const payload = body.trimStart().startsWith('{') ? body : body.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
    if (!payload) throw new Call4meError(`call4me ${name} returned no result`);
    const message = JSON.parse(payload) as {
      result?: { content?: { type: string; text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
      error?: { message: string };
    };
    if (message.error) throw new Call4meError(`call4me ${name}: ${message.error.message}`);
    const result = message.result ?? {};
    return {
      text: (result.content ?? []).map((c) => c.text ?? '').join('\n'),
      isError: Boolean(result.isError),
      ...(result.structuredContent ? { data: result.structuredContent } : {}),
    };
  };
}

const placeCallInput = z.object({
  to: z.string().min(3).max(40).describe('the number to call, e.g. "+14155550123" or "(415) 555-0123"; abroad, include the country code'),
  business: z.string().min(1).max(120).describe('who you are calling, as a person would say it: "Nopa", "Dr. Chen\'s office"'),
  goal: z.string().min(5).max(1500).describe('what the call should achieve, in plain words: "Book a table for 4 tomorrow (Sat Oct 3) around 7pm under Khami."'),
  category: z.enum(CATEGORIES).describe('the kind of call; decides what must be known first. Use "general" for questions and anything that fits no other category'),
  details: z.object({}).catchall(z.string().max(1000)).optional().describe('answers to the category\'s required fields by key, e.g. {"questions":"..."} for general, or {"party_size":"4","date":"Sat Oct 3","time_window":"7pm"} for restaurant. If the call is refused for missing information, the result lists the keys to add'),
  on_behalf_of: z.string().min(1).max(80).optional().describe('who the call is for, as the caller should say it. The caller calls FOR this person and never claims to be them'),
  facts: z.string().max(3000).optional().describe('anything else the caller may share, one per line'),
  flexibility: z.string().max(1500).optional().describe('what the caller may accept without asking: "any time 6:30-8pm", "up to $300"'),
  timezone: z.string().max(60).optional().describe('IANA time zone of the business, e.g. "America/Los_Angeles"'),
  max_minutes: z.number().int().min(1).max(240).optional().describe('cap on talk time; leaves credits free for other calls'),
});

/**
 * AI SDK tools for call4me: real phone calls to businesses from your agent. Calls take minutes, so
 * makePhoneCall waits for the outcome (or a question the business is waiting on) before returning.
 */
export function call4meTools(options: Call4meOptions = {}) {
  const callTool = createCall4meClient(options);
  const maxWaitMs = (options.maxWaitMinutes ?? 15) * 60_000;

  /** Poll get_call (the server holds each request up to 50s) until the call finishes or asks a question. */
  async function waitForCall(callId: string): Promise<Call4meResult> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const view = await callTool('call4me_get_call', { call_id: callId, wait_seconds: 50 });
      const data = view.data as CallView | undefined;
      if (view.isError || data?.finished || data?.open_questions?.length || Date.now() > deadline) return view;
    }
  }

  return {
    makePhoneCall: tool({
      description:
        'Call a business by phone for the user and have a natural conversation to get something done: book, reschedule, cancel, ask questions, wait on hold, navigate phone menus. Waits for the call to finish and returns the outcome and transcript. If the business asks something only the user can answer, it returns early with open_questions: answer with answerQuestion, then follow the call with getCall. If required information is missing it does not dial and says exactly what to ask the user. Billed per minute of talk time.',
      inputSchema: placeCallInput,
      execute: async (input) => {
        const placed = await callTool('call4me_place_call', input);
        const callId = (placed.data as { id?: string } | undefined)?.id;
        if (placed.isError || !callId) return placed;
        return waitForCall(callId);
      },
    }),
    placeCall: tool({
      description: 'Start a phone call to a business without waiting for it to finish. Returns the call id right away; follow it with getCall.',
      inputSchema: placeCallInput,
      execute: async (input) => callTool('call4me_place_call', input),
    }),
    getCall: tool({
      description: 'Status, open questions, live transcript and (once finished) the outcome of a call. Waits up to 50 seconds for something to change.',
      inputSchema: z.object({
        call_id: z.string().min(1).max(40).describe('the call id, e.g. "call_ab12..."'),
        wait_seconds: z.number().int().min(0).max(50).default(50).describe('wait up to this long for the call to finish or ask a question'),
      }),
      execute: async (input) => callTool('call4me_get_call', input),
    }),
    answerQuestion: tool({
      description: 'Answer a question the business is waiting on mid-call (listed in open_questions). The caller relays it on the line.',
      inputSchema: z.object({
        call_id: z.string().min(1).max(40),
        question_id: z.string().min(1).max(40),
        answer: z.string().min(1).max(1000).describe('e.g. "Yes, 8:15 works."'),
      }),
      execute: async (input) => callTool('call4me_answer_question', input),
    }),
    hangUp: tool({
      description: 'End a call in progress now. Talk time so far is billed.',
      inputSchema: z.object({ call_id: z.string().min(1).max(40) }),
      execute: async (input) => callTool('call4me_hang_up', input),
    }),
    getBalance: tool({
      description: 'The prepaid balance, the per-minute price and the account\'s call4me phone numbers.',
      inputSchema: z.object({}),
      execute: async () => callTool('call4me_get_balance', {}),
    }),
    getRequirements: tool({
      description: 'The information a kind of call needs before dialing, and which of it the saved profile already has.',
      inputSchema: z.object({ category: z.enum(CATEGORIES).optional() }),
      execute: async (input) => callTool('call4me_get_requirements', input),
    }),
  };
}
