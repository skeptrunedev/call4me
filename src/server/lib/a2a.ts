import { CATEGORIES, categoryBySlug, type Category } from '../services/intake';

/**
 * A2A 1.0 (a2a-protocol.org) over its JSON-RPC binding: the Agent Card that other agents
 * discover at /.well-known/agent-card.json, and a stateless agent that answers `SendMessage`
 * with the kinds of calls callbay makes and what one of them needs before dialing. Placing a
 * call acts for a signed-in user and spends credits, so it stays on the MCP server; the card
 * and every reply point there. Every task completes within the request, so there is nothing
 * to get, list, cancel, or subscribe to afterwards; those methods say so per the spec.
 */

export const A2A_PROTOCOL_VERSION = '1.0';

export function agentCard(site: string, version: string) {
  // A2A 1.0 card: the transport lives in supportedInterfaces; the 0.3-era top-level url,
  // protocolVersion, and preferredTransport are gone.
  return {
    name: 'callbay',
    description: `Tells other agents what phone calls callbay can make for a user and exactly what each kind of call needs before dialing. Placing the call itself goes through the callbay MCP server at ${site}/mcp, signed in as the user.`,
    version,
    provider: { organization: 'callbay', url: site },
    iconUrl: `${site}/favicon.svg`,
    documentationUrl: `${site}/mcp`,
    supportedInterfaces: [{ url: `${site}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION }],
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'list-call-types',
        name: 'Kinds of calls',
        description: 'The kinds of calls callbay makes (slug, name, examples), the price, and how to connect. Send any text, or a data part {} with no category.',
        tags: ['phone-calls', 'bookings', 'appointments'],
        examples: ['what calls can you make?', 'can callbay book a dentist appointment?'],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['text/plain', 'application/json'],
      },
      {
        id: 'get-requirements',
        name: 'What a call needs',
        description: `Every field one kind of call needs before callbay will dial (required and optional, with the question to ask the user). Send a data part {"category"} or a text message naming the category slug, e.g. "${CATEGORIES[0]!.slug}".`,
        tags: ['phone-calls', 'requirements', 'intake'],
        examples: ['what does a restaurant call need?', 'requirements for flight_change'],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['text/plain', 'application/json'],
      },
    ],
  };
}

// ---- JSON-RPC

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface Part {
  text?: string;
  data?: Record<string, unknown>;
}

interface Message {
  messageId?: string;
  contextId?: string;
  role?: string;
  parts?: Part[];
}

const CODES = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  taskNotFound: -32001,
  unsupported: -32004,
} as const;

const rpcError = (id: RpcRequest['id'], code: number, message: string, data?: unknown) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });
const rpcResult = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });

/** Handle one JSON-RPC request body; the result is always a JSON-RPC response object. */
export function a2aDispatch(rawBody: string, site: string): { status: number; body: unknown } {
  let req: RpcRequest;
  try {
    req = JSON.parse(rawBody) as RpcRequest;
  } catch {
    return { status: 400, body: rpcError(null, CODES.parse, 'Invalid JSON payload') };
  }
  if (!req || typeof req !== 'object' || Array.isArray(req) || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return { status: 400, body: rpcError(Array.isArray(req) ? null : req?.id, CODES.invalidRequest, 'Request payload validation error: expected a JSON-RPC 2.0 object with a method') };
  }
  switch (req.method) {
    case 'SendMessage':
      return sendMessage(req, site);
    case 'GetTask':
    case 'CancelTask':
    case 'SubscribeToTask':
      return { status: 404, body: rpcError(req.id, CODES.taskNotFound, 'Task not found: callbay tasks complete within the SendMessage call and are not stored') };
    case 'ListTasks':
      return { status: 200, body: rpcResult(req.id, { tasks: [], nextPageToken: '', pageSize: 0, totalSize: 0 }) };
    case 'SendStreamingMessage':
    case 'CreateTaskPushNotificationConfig':
    case 'GetTaskPushNotificationConfig':
    case 'ListTaskPushNotificationConfigs':
    case 'DeleteTaskPushNotificationConfig':
    case 'GetExtendedAgentCard':
      return { status: 400, body: rpcError(req.id, CODES.unsupported, `This operation is not supported: ${req.method}`) };
    default:
      return { status: 404, body: rpcError(req.id, CODES.methodNotFound, `Method not found: ${req.method}`) };
  }
}

/** The category a message names: its slug, or the slug with spaces for underscores ("auto service"). */
export function categoryInText(text: string): Category | null {
  const t = text.toLowerCase();
  return CATEGORIES.find((c) => t.includes(c.slug) || t.includes(c.slug.replace(/_/g, ' '))) ?? null;
}

const connectLine = (site: string) => `To place a call, connect the callbay MCP server at ${site}/mcp (the user signs in with Google or X) and use callbay_place_call.`;

function sendMessage(req: RpcRequest, site: string): { status: number; body: unknown } {
  const params = (req.params ?? {}) as { message?: Message };
  const message = params.message;
  if (!message || typeof message !== 'object' || !Array.isArray(message.parts)) {
    return { status: 400, body: rpcError(req.id, CODES.invalidParams, 'Invalid parameters: params.message.parts is required') };
  }
  const text = message.parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).filter(Boolean).join('\n').trim();
  const data = Object.assign({}, ...message.parts.map((p) => (p?.data && typeof p.data === 'object' ? p.data : {}))) as Record<string, unknown>;
  const contextId = typeof message.contextId === 'string' && message.contextId ? message.contextId : crypto.randomUUID();
  const history = [{ ...message, messageId: message.messageId ?? crypto.randomUUID(), contextId, role: message.role ?? 'ROLE_USER' }];
  const task = (status: Record<string, unknown>, artifacts: unknown[] = []) => ({
    id: crypto.randomUUID(),
    contextId,
    status: { timestamp: new Date().toISOString(), ...status },
    artifacts,
    history,
  });
  const reply = (text: string) => ({ messageId: crypto.randomUUID(), contextId, role: 'ROLE_AGENT', parts: [{ text }] });

  // One category's requirements: by data part, or named in the text.
  const asked = typeof data.category === 'string' ? data.category : null;
  const category = asked ? (categoryBySlug(asked) ?? null) : categoryInText(text);
  if (asked && !category) {
    return { status: 200, body: rpcResult(req.id, { task: task({ state: 'TASK_STATE_FAILED', message: reply(`no call category "${asked}". Categories: ${CATEGORIES.map((c) => c.slug).join(', ')}`) }) }) };
  }
  if (category) {
    const fields = category.fields.map((f) => ({ key: f.key, label: f.label, required: f.required, ask: f.ask, fromProfile: f.profile ?? null }));
    const summary = [
      `# ${category.name} (${category.slug})`,
      '',
      `Examples: ${category.examples}.`,
      '',
      'callbay dials only once it has:',
      ...fields.map((f) => `- ${f.key}${f.required ? '' : ' (optional)'}: ${f.ask}${f.fromProfile ? ` (saved profile field ${f.fromProfile})` : ''}`),
      '',
      connectLine(site),
    ].join('\n');
    return { status: 200, body: rpcResult(req.id, { task: task({ state: 'TASK_STATE_COMPLETED' }, [{ artifactId: crypto.randomUUID(), name: 'requirements', parts: [{ text: summary }, { data: { category: category.slug, name: category.name, fields } }] }]) }) };
  }

  const kinds = CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, examples: c.examples }));
  const summary = [
    'callbay places real phone calls to businesses for a user: in the US, Canada and Europe, and in any other country the account holds a callbay number in. Kinds of calls:',
    ...kinds.map((k) => `- ${k.slug}: ${k.name} (${k.examples})`),
    '',
    'Send a category slug to see exactly what that call needs before dialing.',
    connectLine(site),
  ].join('\n');
  return { status: 200, body: rpcResult(req.id, { task: task({ state: 'TASK_STATE_COMPLETED' }, [{ artifactId: crypto.randomUUID(), name: 'call-types', parts: [{ text: summary }, { data: { categories: kinds, mcp: `${site}/mcp` } }] }]) }) };
}
