import { now } from '../lib/ids';
import { hmacHex } from '../lib/keys';
import { telnyx } from '../lib/telnyx';
import { backOfficeInstructions, callInstructions, inboundBackOfficeInstructions, inboundInstructions } from '../voice/prompt';
import { sessionFor, type SessionSetup } from '../voice/session';
import { accounts, type Account } from './accounts';
import { calls, CallError, localTimeIn, type Brief, type CallRow, type Outcome, type PlaceCallInput } from './calls';

/** GPT-Live voices that read as a North American caller. marin is the model default. */
export const VOICES = ['marin', 'cedar', 'gleam', 'meridian'] as const;
export type Voice = (typeof VOICES)[number];

export const pricePerMinute = (env: Env) => Number(env.PRICE_PER_MINUTE_CENTS || 25);

export async function streamUrl(env: Env, origin: string, callId: string): Promise<string> {
  const host = new URL(origin).host;
  return `wss://${host}/voice/stream/${callId}/${await hmacHex(env.STREAM_SECRET, callId)}`;
}

/** The account's own number, bought on first use in the area code of the first place it calls. */
export async function ensureNumber(env: Env, account: Account, nearE164: string): Promise<string> {
  const existing = await env.DB.prepare(`SELECT phone_number FROM accounts WHERE id = ?`).bind(account.id).first<{ phone_number: string | null }>();
  if (existing?.phone_number) return existing.phone_number;
  const bought = await telnyx(env).buyNumber(nearE164.slice(2, 5));
  // A concurrent first call may have bought one too; keep whichever landed first.
  await env.DB.prepare(`UPDATE accounts SET phone_number = COALESCE(phone_number, ?) WHERE id = ?`).bind(bought, account.id).run();
  const row = await env.DB.prepare(`SELECT phone_number FROM accounts WHERE id = ?`).bind(account.id).first<{ phone_number: string }>();
  return row!.phone_number;
}

export async function placeCall(env: Env, origin: string, account: Account, input: PlaceCallInput & { voice?: Voice }): Promise<CallRow> {
  const price = pricePerMinute(env);
  const db = calls(env.DB);
  const call = await db.create(account, input, price);
  const brief = JSON.parse(call.brief) as Brief;
  if (!account.display_name) await accounts(env.DB).setDisplayName(account.id, brief.on_behalf_of);

  try {
    const from = await ensureNumber(env, account, call.to_number);
    await env.DB.prepare(`UPDATE calls SET from_number = ? WHERE id = ?`).bind(from, call.id).run();
    const cb = {
      onBehalfOf: brief.on_behalf_of,
      business: call.business,
      goal: call.goal,
      facts: brief.facts,
      flexibility: brief.flexibility,
      callbackNumber: brief.callback_number ?? from,
      localTime: localTimeIn(brief.timezone),
    };
    const setup: SessionSetup = {
      callId: call.id,
      instructions: callInstructions(cb),
      backOffice: backOfficeInstructions(cb),
      voice: input.voice ?? 'marin',
      maxSeconds: brief.max_minutes * 60,
      pricePerMinuteCents: price,
    };
    const session = sessionFor(env, call.id);
    await session.fetch('https://session/setup', { method: 'POST', body: JSON.stringify(setup) });
    const controlId = await telnyx(env).dial({
      to: call.to_number,
      from,
      webhookUrl: `${origin}/webhooks/telnyx`,
      streamUrl: await streamUrl(env, origin, call.id),
      callId: call.id,
      timeLimitSecs: setup.maxSeconds,
    });
    await db.dialing(call.id, controlId);
    await session.fetch('https://session/control', { method: 'POST', body: JSON.stringify({ controlId }) });
  } catch (err) {
    // The full carrier error stays on the call row for debugging; the agent gets the short version.
    console.error('place call failed', call.id, err);
    await db.finish(call.id, { status: 'failed', error: String(err), pricePerMinuteCents: price });
    throw new CallError(`could not place the call (${call.id}): the phone carrier refused it. nothing was charged; try again shortly.`, 502);
  }
  return (await db.byId(call.id))!;
}

/**
 * Someone called an account's number, usually a business calling back. Answer with a
 * message-taking brief that knows what this number called about recently.
 */
export async function answerInbound(env: Env, origin: string, opts: { controlId: string; from: string; to: string }): Promise<void> {
  const account = await env.DB.prepare(`SELECT id, email, display_name, key_prefix, created_at FROM accounts WHERE phone_number = ?`).bind(opts.to).first<Account>();
  const blocked = await env.DB.prepare(`SELECT 1 FROM blocked_numbers WHERE number = ?`).bind(opts.from).first();
  const price = pricePerMinute(env);
  if (!account || blocked || (await accounts(env.DB).balanceCents(account.id)) < price) {
    await telnyx(env).reject(opts.controlId);
    return;
  }
  const owner = account.display_name || 'the person you reached';
  const { results: recent } = await env.DB.prepare(
    `SELECT business, goal, outcome, created_at FROM calls WHERE account_id = ? AND direction = 'outbound' AND answered_at IS NOT NULL ORDER BY (to_number = ?) DESC, created_at DESC LIMIT 5`,
  )
    .bind(account.id, opts.from)
    .all<{ business: string; goal: string; outcome: string | null; created_at: number }>();
  const earlier = await env.DB.prepare(`SELECT business FROM calls WHERE account_id = ? AND to_number = ? ORDER BY created_at DESC LIMIT 1`).bind(account.id, opts.from).first<{ business: string }>();

  const id = `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const maxMinutes = 10;
  const brief: Brief = { on_behalf_of: owner, facts: '', flexibility: '', callback_number: null, timezone: null, max_minutes: maxMinutes };
  await env.DB.prepare(
    `INSERT INTO calls (id, account_id, direction, to_number, from_number, business, goal, brief, status, telnyx_call_control_id, created_at) VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, 'dialing', ?, ?)`,
  )
    .bind(id, account.id, opts.from, opts.to, earlier?.business ?? 'incoming call', 'take the call and a message', JSON.stringify(brief), opts.controlId, now())
    .run();

  const setup: SessionSetup = {
    callId: id,
    instructions: inboundInstructions({
      owner,
      localTime: null,
      recent: recent.map((r) => ({
        business: r.business,
        goal: r.goal,
        summary: r.outcome ? (JSON.parse(r.outcome) as Outcome).summary : null,
        when: new Date(r.created_at).toISOString().slice(0, 10),
      })),
    }),
    backOffice: inboundBackOfficeInstructions(owner),
    voice: 'marin',
    maxSeconds: maxMinutes * 60,
    pricePerMinuteCents: price,
    controlId: opts.controlId,
  };
  await sessionFor(env, id).fetch('https://session/setup', { method: 'POST', body: JSON.stringify(setup) });
  await telnyx(env).answer(opts.controlId, { webhookUrl: `${origin}/webhooks/telnyx`, streamUrl: await streamUrl(env, origin, id), callId: id, timeLimitSecs: setup.maxSeconds });
}
