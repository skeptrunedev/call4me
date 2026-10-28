import { z } from 'zod';
import {
  buyNumberDescription,
  buyNumberInput,
  confirmVerificationDescription,
  confirmVerificationInput,
  listNumbersDescription,
  numberPath,
  numbersOutput,
  numbersPath,
  numberView,
  ownNumberInput,
  ownNumberPath,
  ownNumbersPath,
  ownNumberVerifyPath,
  ownNumberView,
  pendingNumberView,
  releaseNumberDescription,
  releaseNumberInput,
  removeOwnNumberDescription,
  sendVerificationDescription,
  sendVerificationInput,
} from './number-schema';
import {
  answerInput,
  balanceOutput,
  balancePath,
  callActionOutput,
  callAnswerPath,
  callConnectPath,
  callHangUpPath,
  callOutput,
  callPath,
  callsPath,
  categoriesOutput,
  categoryRequirementsPath,
  connectInput,
  placeCallInput,
  profileInput,
  profileOutput,
  profilePath,
  requirementsOutput,
  requirementsPath,
  scheduleCallInput,
  scheduledCallPath,
  scheduledCallsPath,
  scheduledOutput,
  X402_CALL_MINUTES,
  x402CallInput,
  x402CallsPath,
} from './call-schema';
import { IDEMPOTENCY_KEY_MAX } from './idempotency';
import { DESTINATION_PRICE_CENTS } from './rates';
import { MAX_TOPUP_CENTS, MIN_TOPUP_CENTS } from '../services/topups';
import { recordingDescription, recordingInput, recordingOutput, recordingPath } from './recording-schema';

const usd = (cents: number) => (cents / 100).toFixed(2);

/** Generated from the same schemas used by the HTTP route and MCP tool. */
export function openApiDocument(site: string, pricePerMinuteCents = 25) {
  const schema = (s: z.ZodType) => z.toJSONSchema(s, { target: 'draft-2020-12' });
  const json = (description: string, s: z.ZodType) => ({ description, content: { 'application/json': { schema: schema(s) } } });
  const bearer = [{ bearerAuth: [] }];
  const path = (name: string, description: string, s: z.ZodType) => ({ name, in: 'path', required: true, description, schema: schema(s) });
  const query = (name: string, description: string, s: z.ZodType) => ({ name, in: 'query', required: false, description, schema: schema(s) });
  const body = (s: z.ZodType) => ({ required: true, content: { 'application/json': { schema: schema(s) } } });
  const callId = path('call_id', 'the call id from placing or listing calls ("call_...")', z.string());
  const idempotencyKey = (made: string) => ({
    name: 'Idempotency-Key',
    in: 'header',
    required: false,
    description: `A unique value per request (a UUID), kept on retries of it. A retry with the same key and body returns the ${made} the first request made (200, with Idempotent-Replayed: true) instead of placing another; the same key with a different body is refused (422). Keys belong to the account and never expire. A request refused before anything was placed (422 "Not calling yet", 402) does not use up its key.`,
    schema: schema(z.string().min(1).max(IDEMPOTENCY_KEY_MAX)),
  });
  const error = { description: 'Request failed', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] } } } };
  // Paid over x402 (USDC on Base): the 402 carries the exact amount in PAYMENT-REQUIRED.
  const paymentRequired = { description: 'Payment required: the x402 v2 requirements, also in the PAYMENT-REQUIRED header', content: { 'application/json': { schema: { type: 'object', properties: { x402Version: { type: 'integer' }, accepts: { type: 'array', items: { type: 'object' } } }, required: ['x402Version', 'accepts'] } } } };
  const priced = (minCents: number, maxCents: number) => ({ price: { mode: 'dynamic', currency: 'USD', min: usd(minCents), max: usd(maxCents) }, protocols: [{ x402: {} }] });
  const topPrice = Math.max(pricePerMinuteCents, ...Object.values(DESTINATION_PRICE_CENTS));
  return {
    openapi: '3.1.0',
    info: {
      title: 'call4me API',
      version: '1.3.0',
      description:
        'Phone calls an AI agent places for its user: call a business, follow the call to its outcome, answer the caller\'s questions mid-call, and patch the user in. Also the prepaid balance, the caller profile, scheduled calls, the account\'s phone numbers and call recordings. The same operations as the MCP server at /mcp. Calls are billed per minute from pickup (phone menus and conversation; hold time at half price) from the prepaid balance; unanswered calls are free. Refusals name MCP tools (call4me_place_call is POST /api/calls, call4me_save_profile is PATCH /api/profile).',
      'x-guidance':
        'With a wallet and no account: POST /api/x402/calls with the call (to, business, goal, category, details, on_behalf_of, max_minutes) and pay the 402 in USDC on Base. A refusal (422 "Not calling yet") lists what to ask the user and takes no payment. The paid response returns the call id and an api_key; follow the call with GET /api/calls/{call_id}?wait_seconds=30 and Authorization: Bearer <api_key> until finished, answering open questions with POST /api/calls/{call_id}/answer. With an account: the bearer routes below, and GET /api to buy credits in USDC.',
      contact: { name: 'call4me', email: 'me@call4.me', url: site },
    },
    servers: [{ url: site }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'A call4me API key or OAuth access token for the site or MCP resource.' } } },
    paths: {
      '/api': {
        get: {
          operationId: 'buyCredits',
          description: 'Buy call credits in USDC on Base over x402 for the account named by the bearer token. Without a payment: 402 with the price of `amount` dollars of credits.',
          security: bearer,
          parameters: [query('amount', `dollars of credits, ${MIN_TOPUP_CENTS / 100} to ${MAX_TOPUP_CENTS / 100} (default ${MIN_TOPUP_CENTS / 100})`, z.number().min(MIN_TOPUP_CENTS / 100).max(MAX_TOPUP_CENTS / 100))],
          'x-payment-info': priced(MIN_TOPUP_CENTS, MAX_TOPUP_CENTS),
          responses: {
            '200': json('Credited', z.looseObject({ credited: z.string(), credited_cents: z.number(), balance: z.string(), balance_cents: z.number(), transaction: z.string(), payer: z.string() })),
            '400': error, '401': error, '402': paymentRequired, '503': error },
        },
      },
      [x402CallsPath]: {
        post: {
          operationId: 'placePaidCall',
          description: `Place a call paid in USDC on Base over x402, with no call4me account: the payment is max_minutes (default ${X402_CALL_MINUTES.default}, up to ${X402_CALL_MINUTES.max}) at the destination's per-minute price, and the paying wallet becomes a call4me account. The call is checked before payment settles: 422 "Not calling yet" lists what to ask the user and takes nothing. Returns the call and the account's api_key; follow it with GET /api/calls/{call_id}. Minutes the call does not use stay as credits on that account.`,
          security: [],
          requestBody: body(x402CallInput),
          'x-payment-info': priced(pricePerMinuteCents, X402_CALL_MINUTES.max * topPrice),
          responses: {
            '201': json('Paid and dialing', z.looseObject({ call: callOutput, api_key: z.string(), follow: z.string(), credited: z.string(), credited_cents: z.number(), balance: z.string(), balance_cents: z.number(), transaction: z.string(), payer: z.string() })),
            '400': error, '402': paymentRequired, '403': error, '409': error, '422': error, '502': error, '503': error },
        },
      },
      [balancePath]: {
        get: { operationId: 'getBalance', description: 'The prepaid balance, the per-minute price (and the destinations priced differently), and the account\'s call4me numbers. Free.', security: bearer, responses: { '200': json('The balance and numbers', balanceOutput), '401': error } },
      },
      [requirementsPath]: {
        get: { operationId: 'listCallCategories', description: 'The kinds of call (category slugs) call4me places. Each decides what must be known before dialing. Free.', security: bearer, responses: { '200': json('The categories', categoriesOutput), '401': error } },
      },
      [categoryRequirementsPath]: {
        get: {
          operationId: 'getCallRequirements',
          description: 'The information a kind of call needs before dialing, and which of it the saved profile already has. Ask the user for every required field not known, in one message, then pass the answers in details when placing the call. Free.',
          security: bearer,
          parameters: [path('category', 'a category slug from /api/requirements, e.g. "restaurant"', z.string())],
          responses: { '200': json('What the call needs', requirementsOutput), '401': error, '404': error },
        },
      },
      [profilePath]: {
        get: { operationId: 'getProfile', description: 'Saved details reused on relevant calls (name, DOB, phone, address, insurance, car). An incomplete profile is fine. Free.', security: bearer, responses: { '200': json('The saved profile', profileOutput), '401': error } },
        patch: {
          operationId: 'saveProfile',
          description: 'Save facts that are the same on every call. Merges into what is saved; an empty string removes a field. Save only what the user agreed to keep.',
          security: bearer,
          requestBody: body(profileInput('agents')),
          responses: { '200': json('The profile now saved', profileOutput), '400': error, '401': error },
        },
      },
      [callsPath]: {
        get: {
          operationId: 'listCalls',
          description: 'Recent calls, newest first (without transcripts), and scheduled calls that have not dialed yet. Free.',
          security: bearer,
          parameters: [query('limit', '1 to 50, default 10', z.number().int().min(1).max(50))],
          responses: { '200': json('The calls', z.looseObject({ calls: z.array(callOutput), scheduled: z.array(scheduledOutput) })), '401': error },
        },
        post: {
          operationId: 'placeCall',
          description:
            'Call a business for the user and have a natural conversation to get something done (book, reschedule, cancel, ask). Refuses with 422 "Not calling yet" until the category\'s required information is known, listing exactly what to ask the user. Returns at once with the call; follow it with GET /api/calls/{call_id}?wait_seconds=30 until finished, answering any open question right away. Credits for the maximum length are held up front; billed per minute from pickup (phone menus and conversation; hold time at half price), rounded up; unanswered calls are free.',
          security: bearer,
          parameters: [idempotencyKey('call')],
          requestBody: body(placeCallInput('agents')),
          responses: { '200': json('A retry under the same Idempotency-Key: the call the first request placed', callOutput), '201': json('The call, dialing', callOutput), '400': error, '401': error, '402': error, '403': error, '422': error },
        },
      },
      [callPath]: {
        get: {
          operationId: 'getCall',
          description: 'Status, open questions, live transcript and, once finished, the outcome and cost of a call. With wait_seconds it waits for something to change (a new question, the call finishing) before answering. Takes a scheduled id (sched_...) too. Free.',
          security: bearer,
          parameters: [path('call_id', 'a call id ("call_...") or a scheduled id ("sched_...")', z.string()), query('wait_seconds', '0 to 50, default 0', z.number().int().min(0).max(50))],
          responses: { '200': json('The call (with scheduled when it came from a schedule), or a schedule not dialed yet', callOutput), '400': error, '401': error, '404': error },
        },
      },
      [callAnswerPath]: {
        post: {
          operationId: 'answerQuestion',
          description: 'Answer a question the caller asked mid-call (open_questions). The caller relays it on the line within a second or two. Answer in a few plain words.',
          security: bearer,
          parameters: [callId],
          requestBody: body(answerInput),
          responses: { '200': json('Sent to the caller', z.looseObject({ id: z.string(), question: z.string(), answer: z.string() })), '400': error, '401': error, '404': error },
        },
      },
      [callConnectPath]: {
        post: {
          operationId: 'connectUser',
          description: 'Ring the user now and patch them into a live call. They are on the call as soon as they answer; the caller goes quiet and takes back over when they press * or hang up. Mode "listen" lets them listen in without being heard. Tell the user before calling this.',
          security: bearer,
          parameters: [callId],
          requestBody: { required: false, content: { 'application/json': { schema: schema(connectInput) } } },
          responses: { '200': json('Ringing the user', callActionOutput), '400': error, '401': error, '404': error, '409': error },
        },
      },
      [callHangUpPath]: {
        post: {
          operationId: 'hangUp',
          description: 'End a call in progress now. Talk time so far is billed as usual.',
          security: bearer,
          parameters: [callId],
          responses: { '200': json('Hanging up', callActionOutput), '401': error, '404': error, '409': error },
        },
      },
      [scheduledCallsPath]: {
        post: {
          operationId: 'scheduleCall',
          description: 'Place a call later (the business is closed, or the user wants it at a set time). Takes everything POST /api/calls takes, plus call_at, and checks it now. Nobody may be following the call when it runs, so give every fact and all the flexibility it needs up front. Credits are held when it dials.',
          security: bearer,
          parameters: [idempotencyKey('scheduled call')],
          requestBody: body(scheduleCallInput('agents')),
          responses: { '200': json('A retry under the same Idempotency-Key: the call the first request scheduled', scheduledOutput), '201': json('The scheduled call', scheduledOutput), '400': error, '401': error, '422': error },
        },
      },
      [scheduledCallPath]: {
        delete: {
          operationId: 'cancelScheduledCall',
          description: 'Cancel a scheduled call before it dials.',
          security: bearer,
          parameters: [path('scheduled_id', 'the id from POST /api/scheduled-calls ("sched_...")', z.string())],
          responses: { '200': json('The canceled schedule', scheduledOutput), '400': error, '401': error, '404': error },
        },
      },
      [numbersPath]: {
        get: {
          operationId: 'listNumbers',
          description: listNumbersDescription,
          security: [{ bearerAuth: [] }],
          responses: { '200': json('The account\'s numbers and the countries more can be bought in', numbersOutput), '401': error },
        },
        post: {
          operationId: 'buyNumber',
          description: buyNumberDescription,
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: schema(buyNumberInput) } } },
          responses: {
            '201': json('The number bought, ready to call from', numberView),
            '202': json('The number bought and waiting on the carrier\'s approval; it activates by itself', z.object({ pending: pendingNumberView })),
            '400': error, '401': error, '402': error, '409': error, '502': error, '503': error },
        },
      },
      [numberPath]: {
        delete: {
          operationId: 'releaseNumber',
          description: releaseNumberDescription,
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'number', in: 'path', required: true, description: 'E.164, URL-encoded (+ as %2B)', schema: schema(releaseNumberInput.shape.number) }],
          responses: { '200': json('The number released', numberView), '401': error, '404': error, '409': error, '502': error },
        },
      },
      [ownNumbersPath]: {
        post: {
          operationId: 'sendNumberVerification',
          description: sendVerificationDescription,
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: schema(sendVerificationInput) } } },
          responses: { '202': json('The code was sent; the number waits on it', ownNumberView), '400': error, '401': error, '409': error, '429': error, '502': error },
        },
      },
      [ownNumberVerifyPath]: {
        post: {
          operationId: 'confirmNumberVerification',
          description: confirmVerificationDescription,
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'number', in: 'path', required: true, description: 'E.164, URL-encoded (+ as %2B)', schema: schema(ownNumberInput.shape.number) }],
          requestBody: { required: true, content: { 'application/json': { schema: schema(confirmVerificationInput) } } },
          responses: { '200': json('The number, verified', ownNumberView), '400': error, '401': error, '404': error, '409': error, '502': error },
        },
      },
      [ownNumberPath]: {
        delete: {
          operationId: 'removeOwnNumber',
          description: removeOwnNumberDescription,
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'number', in: 'path', required: true, description: 'E.164, URL-encoded (+ as %2B)', schema: schema(ownNumberInput.shape.number) }],
          responses: { '200': json('The number removed', ownNumberView), '401': error, '404': error, '502': error },
        },
      },
      [recordingPath]: {
        get: {
          operationId: 'getCallRecordings',
          description: recordingDescription,
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'call_id', in: 'path', required: true, schema: z.toJSONSchema(recordingInput.shape.call_id, { target: 'draft-2020-12' }) }],
          responses: {
            '200': { description: 'Available recordings and fresh download links', content: { 'application/json': { schema: z.toJSONSchema(recordingOutput, { target: 'draft-2020-12' }) } } },
            '400': error, '401': error, '404': error, '409': error, '502': error,
          },
        },
      },
    },
  };
}
