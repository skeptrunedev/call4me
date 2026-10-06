import { newId, now } from '../lib/ids';
import { hmacHex } from '../lib/keys';
import { checkDialable } from '../lib/phone';
import { DESTINATION_PRICE_CENTS } from '../lib/rates';
import { telnyx } from '../lib/telnyx';
import { backOfficeInstructions, callInstructions, inboundBackOfficeInstructions, inboundInstructions, type OpenTask } from '../voice/prompt';
import type { SessionSetup } from '../voice/session';
import { sessionFor } from '../voice/stub';
import { accounts, type Account } from './accounts';
import { mayCall, numbers } from './numbers';
import { profiles } from './profiles';
import { assistantNameOf, type Profile, type Surface } from './intake';
import { calls, CallError, LIMITS, likelyTask, localTimeIn, openTasks, SECRET_MASK, type Brief, type CallRow, type Outcome, type PlaceCallInput } from './calls';
import { analytics } from './analytics';

/** GPT-Live voices that read as a North American caller. marin is the model default. */
export const VOICES = ['marin', 'cedar', 'gleam', 'meridian'] as const;
export type Voice = (typeof VOICES)[number];

export const pricePerMinute = (env: Env) => Number(env.PRICE_PER_MINUTE_CENTS || 25);

/** What a call to `to` costs per minute: its destination's own price (lib/rates.ts), else the standard one. */
export function pricePerMinuteTo(env: Env, to: string): number {
  const p = checkDialable(to);
  return (p.ok && DESTINATION_PRICE_CENTS[p.country]) || pricePerMinute(env);
}

/** The per-minute price a call is billed at: by destination when we placed it, the standard one for a call that came in. */
export const callPrice = (env: Env, row: Pick<CallRow, 'direction' | 'to_number'>) => (row.direction === 'outbound' ? pricePerMinuteTo(env, row.to_number) : pricePerMinute(env));

/**
 * Whether keypad presses on a call with `other` should be tones in the audio: anywhere but a +1
 * number, since some international routes drop Telnyx's RFC 2833 key events (voice/dtmf.ts).
 */
export function inbandKeysFor(other: string): boolean {
  const p = checkDialable(other);
  return p.ok && !p.home;
}

/** Telnyx's media stream for a call, on the voice Worker's own host (src/server/voice/worker.ts). */
export async function streamUrl(env: Env, callId: string): Promise<string> {
  return `wss://${env.VOICE_HOST}/voice/stream/${callId}/${await hmacHex(env.STREAM_SECRET, callId)}`;
}

/**
 * A voice Worker deploy resets every call session (scripts/deploy-voice.sh). The deploy locks
 * only once no call is up, and the call's row is already written when this runs, so either the
 * deploy sees this call and backs off, or this call sees the lock. A call that sees the lock is
 * refused on the spot instead of waiting it out: the wait lived in the request that placed the
 * call, and a request can end before a deploy does, which left the call queued for good with its
 * hold taken (call_mrdx09t3kusxru6l). The lock expires on its own if a deploy dies.
 */
export class VoiceDeployLocked extends Error {
  constructor(readonly retryInSeconds: number) {
    super(`voice deploy in progress, retry in about ${retryInSeconds}s`);
  }
}

export async function assertVoiceUnlocked(db: D1Database, at = Date.now()): Promise<void> {
  const lock = await db.prepare(`SELECT locked_until FROM voice_deploys WHERE id = 1`).first<{ locked_until: number }>();
  if (lock && lock.locked_until > at) throw new VoiceDeployLocked(Math.ceil((lock.locked_until - at) / 1000));
}

/** How long an outbound call may sit queued before it can only be an orphan: dialing takes seconds. */
export const NEVER_DIALED_MS = 5 * 60_000;

/**
 * Fails outbound calls still queued, with no carrier call, long after they were placed, releasing
 * their holds. Placing a call either dials it or fails it, so one left behind means the request
 * that placed it ended mid-way; the cron sweeps them so none stays queued, holding credits and
 * looking live to the voice deploy.
 */
export async function failNeverDialed(env: Env, at = Date.now()): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, direction, to_number FROM calls WHERE status = 'queued' AND telnyx_call_control_id IS NULL AND created_at < ?`,
  )
    .bind(at - NEVER_DIALED_MS)
    .all<Pick<CallRow, 'id' | 'direction' | 'to_number'>>();
  const db = calls(env.DB);
  for (const row of results) {
    await db.finish(row.id, { status: 'failed', error: 'never dialed: the request placing it ended before it dialed', pricePerMinuteCents: callPrice(env, row), at });
  }
  return results.length;
}

/** How long a call the carrier started may look live before the sweep asks the carrier whether it still is. */
export const LOST_AFTER_MS = 10 * 60_000;

/**
 * Ends calls the carrier started that still look live here long after, once the carrier says they
 * are over: their hangup never reached us (it came before the call row existed, or was lost), so
 * they would hold credits and look live to the voice deploy forever. They end unbilled, since
 * without the hangup the talk time isn't known.
 */
export async function settleLost(env: Env, at = Date.now()): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, direction, to_number, telnyx_call_control_id FROM calls WHERE status IN ('dialing', 'in_progress') AND telnyx_call_control_id IS NOT NULL AND created_at < ?`,
  )
    .bind(at - LOST_AFTER_MS)
    .all<Pick<CallRow, 'id' | 'direction' | 'to_number' | 'telnyx_call_control_id'>>();
  const db = calls(env.DB);
  const carrier = telnyx(env);
  let settled = 0;
  for (const row of results) {
    try {
      if (await carrier.callAlive(row.telnyx_call_control_id!)) continue;
    } catch (err) {
      console.error('checking a lost call failed', row.id, err);
      continue;
    }
    await db.finish(row.id, { status: 'failed', error: 'the carrier ended this call without our hearing its hangup', pricePerMinuteCents: callPrice(env, row), at });
    settled++;
  }
  return settled;
}

/** The account's owner, who can be patched into any of its calls: their name and their own phone. */
async function personFor(env: Env, origin: string, account: Account, profile: Profile, from: string, connectWhen: string | null = null, listenIn = false): Promise<NonNullable<SessionSetup['person']>> {
  // Profiles hold numbers as people type them; Telnyx dials E.164 only.
  const phone = profile.phone ? checkDialable(profile.phone) : null;
  const reachable = phone?.ok && (await mayCall(env.DB, account.id, phone)) ? phone.e164 : null;
  return { name: profile.full_name || account.display_name || 'the account owner', phone: reachable, from, webhookUrl: `${origin}/webhooks/telnyx`, connectWhen, listenIn };
}

export async function placeCall(env: Env, origin: string, account: Account, input: PlaceCallInput & { voice?: Voice }, surface: Surface = 'agents'): Promise<CallRow> {
  const price = pricePerMinuteTo(env, input.to);
  const db = calls(env.DB);
  const { call, secrets, to } = await db.create(account, input, price, surface);
  const brief = JSON.parse(call.brief) as Brief;
  if (!account.display_name) await accounts(env.DB).setDisplayName(account.id, brief.on_behalf_of);

  try {
    await assertVoiceUnlocked(env.DB);
    const n = numbers(env);
    const caller = await n.callerId(account, to, input.from);
    const from = caller.number;
    // The user's phone always rings from a call4me number, never from their own.
    const ring = caller.own ? (await n.callerId(account, to)).number : from;
    await env.DB.prepare(`UPDATE calls SET from_number = ?, ring_number = ? WHERE id = ?`).bind(from, caller.own ? ring : null, call.id).run();
    const profile = await profiles(env.DB).get(account.id);
    const person = await personFor(env, origin, account, profile, ring, brief.connect_when ?? null, brief.listen_in ?? false);
    const cb = {
      onBehalfOf: brief.on_behalf_of,
      business: call.business,
      goal: call.goal,
      // Secrets were masked in the stored brief; the caller gets the real values.
      facts: secrets.reduce((f, sec) => f.replace(`${sec.label}: ${SECRET_MASK}`, `${sec.label}: ${sec.value} (share only when they ask to verify the account)`), brief.facts),
      flexibility: brief.flexibility,
      // Callbacks come to the number the business saw: a call4me number answers and takes a
      // message, the user's own number rings the user.
      callbackNumber: from,
      callbackRingsOwner: caller.own,
      localTime: localTimeIn(brief.timezone),
      owner: person.name,
      assistantName: brief.caller_name || assistantNameOf(profile),
      callingAs: brief.calling_as ?? null,
      connectWhen: brief.connect_when ?? null,
    };
    const stream = await streamUrl(env, call.id);
    const setup: SessionSetup = {
      callId: call.id,
      streamUrl: stream,
      person,
      instructions: callInstructions(cb),
      backOffice: backOfficeInstructions(cb),
      voice: input.voice ?? 'marin',
      maxSeconds: brief.max_minutes * 60,
      pricePerMinuteCents: price,
      redact: secrets.map((sec) => sec.value),
      inbandKeys: inbandKeysFor(call.to_number),
    };
    const session = sessionFor(env, call.id);
    await session.fetch('https://session/setup', { method: 'POST', body: JSON.stringify(setup) });
    const controlId = await telnyx(env).dial({
      to: call.to_number,
      from,
      webhookUrl: `${origin}/webhooks/telnyx`,
      streamUrl: stream,
      callId: call.id,
      timeLimitSecs: setup.maxSeconds,
    });
    await db.dialing(call.id, controlId);
    await session.fetch('https://session/control', { method: 'POST', body: JSON.stringify({ controlId }) });
  } catch (err) {
    // The full carrier error stays on the call row for debugging; the agent gets the short version.
    console.error('place call failed', call.id, err);
    await db.finish(call.id, { status: 'failed', error: String(err), pricePerMinuteCents: price });
    if (err instanceof VoiceDeployLocked) {
      throw new CallError(`could not place the call (${call.id}): call4me is updating its phone service. nothing was charged; place it again in about ${err.retryInSeconds} seconds.`, 503, call.id);
    }
    throw new CallError(`could not place the call (${call.id}): the phone carrier refused it. nothing was charged; try again shortly.`, 502, call.id);
  }
  // No category: some (doctor, dentist) are health information, which ad platforms must not get.
  await analytics(env).track(account, [{ name: 'call_placed', params: { surface, call_id: call.id } }]);
  return (await db.byId(call.id))!;
}

/**
 * Someone called an account's number, usually a business calling back. Answer with a
 * message-taking brief that knows what this number called about recently.
 */
export async function answerInbound(env: Env, origin: string, opts: { controlId: string; from: string; to: string }): Promise<void> {
  const account = await env.DB.prepare(
    `SELECT a.id, a.email, a.display_name, a.key_prefix, a.created_at, a.ga_client_id, a.ga_signup_at, a.meta_fbp, a.meta_fbc, a.first_touch FROM accounts a JOIN numbers n ON n.account_id = a.id WHERE n.phone_number = ? AND n.status = 'active'`,
  )
    .bind(opts.to)
    .first<Account>();
  const blocked = await env.DB.prepare(`SELECT 1 FROM blocked_numbers WHERE number = ?`).bind(opts.from).first();
  const price = pricePerMinute(env);
  const balance = account ? await accounts(env.DB).balanceCents(account.id) : 0;
  if (!account || blocked || balance < price) {
    await telnyx(env).reject(opts.controlId);
    return;
  }
  const owner = account.display_name || 'the person you reached';
  const db = calls(env.DB);
  // A callback only knows the calls placed from the number it rang, and answers as they were made:
  // an account calling for several companies gives each its own number.
  const { results: recent } = await env.DB.prepare(
    `SELECT business, goal, outcome, created_at FROM calls WHERE account_id = ? AND direction = 'outbound' AND from_number = ? AND answered_at IS NOT NULL ORDER BY (to_number = ?) DESC, created_at DESC LIMIT 5`,
  )
    .bind(account.id, opts.to, opts.from)
    .all<{ business: string; goal: string; outcome: string | null; created_at: number }>();
  const earlier = await env.DB.prepare(`SELECT business FROM calls WHERE account_id = ? AND to_number = ? ORDER BY created_at DESC LIMIT 1`).bind(account.id, opts.from).first<{ business: string }>();
  // A business calling back after a voicemail gets the original task finished, not a message taken.
  const tasks = openTasks((await db.unfinished(account.id)).filter((r) => r.from_number === opts.to), opts.from).slice(0, 3);
  const likely = likelyTask(tasks, opts.from);
  const openTask = (r: CallRow): OpenTask => {
    const b = JSON.parse(r.brief) as Brief;
    return {
      business: r.business,
      goal: r.goal,
      onBehalfOf: b.on_behalf_of,
      facts: b.facts,
      flexibility: b.flexibility,
      when: new Date(r.created_at).toISOString().slice(0, 10),
      lastResult: r.outcome ? (JSON.parse(r.outcome) as Outcome).summary : null,
    };
  };

  const id = `call_${newId()}`;
  // Credits up front here too: the callback holds what it may cost before it is answered.
  const maxMinutes = Math.min(LIMITS.maxMinutes, Math.floor(balance / price));
  const holdCents = maxMinutes * price;
  if (!(await accounts(env.DB).hold(account.id, holdCents, `hold:${id}`, `up to ${maxMinutes} min callback`))) {
    await telnyx(env).reject(opts.controlId);
    return;
  }
  // A callback on a known task carries that task's brief, so its recap is judged against the goal.
  const likelyBrief = likely ? (JSON.parse(likely.brief) as Brief) : null;
  // Who answers: the identity of the call being returned, else of the latest call placed from this number.
  const latest = likelyBrief
    ? null
    : await env.DB.prepare(`SELECT brief FROM calls WHERE account_id = ? AND direction = 'outbound' AND from_number = ? ORDER BY (to_number = ?) DESC, created_at DESC LIMIT 1`)
        .bind(account.id, opts.to, opts.from)
        .first<{ brief: string }>();
  const identity: Pick<Brief, 'caller_name' | 'calling_as'> = likelyBrief ?? (latest ? (JSON.parse(latest.brief) as Brief) : {});
  const brief: Brief = likelyBrief
    ? { ...likelyBrief, max_minutes: maxMinutes }
    : { on_behalf_of: owner, facts: '', flexibility: '', timezone: null, max_minutes: maxMinutes, caller_name: identity.caller_name ?? null, calling_as: identity.calling_as ?? null };
  await env.DB.prepare(
    `INSERT INTO calls (id, account_id, direction, to_number, from_number, business, goal, brief, status, telnyx_call_control_id, hold_cents, callback_for, created_at) VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, 'dialing', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      account.id,
      opts.from,
      opts.to,
      likely?.business ?? earlier?.business ?? 'incoming call',
      likely?.goal ?? (tasks.length ? 'finish an unfinished task, or take a message' : 'take the call and a message'),
      JSON.stringify(brief),
      opts.controlId,
      holdCents,
      likely?.id ?? null,
      now(),
    )
    .run();

  try {
    await assertVoiceUnlocked(env.DB);
  } catch (err) {
    // Mid-deploy a session can't hold the call; the business can call back in a few minutes.
    await telnyx(env).reject(opts.controlId);
    await db.finish(id, { status: 'failed', error: String(err), pricePerMinuteCents: price });
    return;
  }
  const ordered = likely ? [likely, ...tasks.filter((t) => t !== likely)] : tasks;
  const profile = await profiles(env.DB).get(account.id);
  const setup: SessionSetup = {
    callId: id,
    instructions: inboundInstructions({
      owner,
      assistantName: identity.caller_name || assistantNameOf(profile),
      callingAs: identity.calling_as ?? null,
      tasks: ordered.map(openTask),
      likely: Boolean(likely),
      localTime: localTimeIn(likelyBrief?.timezone ?? null),
      recent: recent.map((r) => ({
        business: r.business,
        goal: r.goal,
        summary: r.outcome ? (JSON.parse(r.outcome) as Outcome).summary : null,
        when: new Date(r.created_at).toISOString().slice(0, 10),
      })),
    }),
    backOffice: inboundBackOfficeInstructions(owner, ordered.map(openTask)),
    inbandKeys: inbandKeysFor(opts.from),
    person: await personFor(env, origin, account, profile, opts.to),
    voice: 'marin',
    maxSeconds: maxMinutes * 60,
    pricePerMinuteCents: price,
    controlId: opts.controlId,
    streamUrl: await streamUrl(env, id),
  };
  try {
    await sessionFor(env, id).fetch('https://session/setup', { method: 'POST', body: JSON.stringify(setup) });
    await telnyx(env).answer(opts.controlId, { webhookUrl: `${origin}/webhooks/telnyx`, streamUrl: setup.streamUrl!, callId: id, timeLimitSecs: setup.maxSeconds });
  } catch (err) {
    // Most often the caller hung up while this was setting up: answering fails, and their hangup
    // may have come before the call row existed, so nothing else would end it or release its hold.
    console.error('answering an incoming call failed', id, err);
    await db.finish(id, { status: 'failed', error: `could not answer: ${String(err)}`, pricePerMinuteCents: price });
  }
}
