import { DESTINATION_PRICE_CENTS } from '../lib/rates';
import { checkDialable, formatPhone } from '../lib/phone';
import { sessionFor } from '../voice/stub';
import { accounts, dollars, type Account } from './accounts';
import { ACTIVE, CallError, calls, type CallRow, type Outcome, type Question, type TranscriptLine } from './calls';
import { pricePerMinute } from './dialer';
import { PROFILE_FIELDS, type Catalog } from './intake';
import { mayCall, numbers } from './numbers';
import { profiles } from './profiles';
import { isScheduledId, scheduledCalls, scheduledView, type ScheduledView } from './scheduled';
import { reloadOf } from './topups';

/**
 * The call operations behind both the MCP tools (mcp/server.ts) and the /api routes
 * (routes/calls.ts): each returns the structured result, and the caller words it for its surface.
 */

const callingNumber = (row: CallRow) => row.ring_number ?? row.from_number;

/**
 * Who ended a finished call and why, in words: a drop on the phone network reads differently from
 * the business hanging up or call4me hanging up its side. Telnyx's hangup_source says which leg
 * ended it ('caller' is us on an outbound call); end_reason says why when it was us.
 */
export function howItEnded(row: CallRow, transcript: TranscriptLine[]): string | null {
  if (ACTIVE.includes(row.status) || !row.answered_at) return row.hangup_cause;
  const them = row.direction === 'outbound' ? 'the business' : 'the caller';
  const ourLeg = row.direction === 'outbound' ? 'caller' : 'callee';
  let ended: string;
  if (row.error) ended = `call4me ended the call after a failure: ${row.error}`;
  else if (row.hangup_cause && row.hangup_cause !== 'normal_clearing') ended = `the call dropped on the phone network (${row.hangup_cause}), not a hang-up`;
  else if (row.hangup_source === ourLeg) ended = `call4me hung up: ${row.end_reason ?? 'no reason recorded'}`;
  else if (row.hangup_source && row.hangup_source !== 'unknown') ended = `${them} hung up`;
  else ended = row.end_reason ? `call4me hung up: ${row.end_reason}` : `${them} hung up, or the line dropped (the carrier did not say which side)`;
  // An answered line that never carried a word from them is worth knowing before redialing.
  if (!transcript.some((l) => l.role === 'them')) ended += `. No speech ever came through from ${them}'s side of the line`;
  return ended;
}

/** The shape every call operation returns: what an agent needs to decide its next step. */
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
    // The call4me number the call is tied to, which rings the user to join. A call placed from the
    // user's own number (own_number, what the business saw) still rings them from a call4me number.
    calling_number: callingNumber(row) ? formatPhone(callingNumber(row)!) : null,
    calling_number_e164: callingNumber(row),
    own_number: row.ring_number && row.from_number ? formatPhone(row.from_number) : null,
    goal: row.goal,
    outcome,
    callback_for: row.callback_for,
    callbacks: callbacks.map((c) => ({ id: c.id, created_at: new Date(c.created_at).toISOString(), outcome: c.outcome ? (JSON.parse(c.outcome) as Outcome) : null })),
    open_questions: questions.filter((q) => !q.answer).map((q) => ({ id: q.id, question: q.question })),
    answered_questions: questions.filter((q) => q.answer).map((q) => ({ question: q.question, answer: q.answer })),
    talk_minutes: row.billed_seconds ? Math.ceil(row.billed_seconds / 60) : 0,
    cost: dollars(row.cost_cents ?? 0),
    cost_cents: row.cost_cents ?? 0,
    hangup_cause: row.hangup_cause,
    ended: howItEnded(row, transcript),
    error: row.error,
    created_at: new Date(row.created_at).toISOString(),
    transcript: transcript.map((l) => `${l.role}: ${l.text}`),
  };
}

export type CallView = ReturnType<typeof callView>;

/**
 * A call, or a scheduled call and the call it became. With waitSeconds it waits for something to
 * change (a new open question, the call finishing) before returning.
 */
export async function followCall(env: Env, accountId: string, id: string, waitSeconds: number): Promise<{ scheduled: ScheduledView | null; call: CallView | null }> {
  const db = calls(env.DB);
  let callId = id;
  let scheduled: ScheduledView | null = null;
  if (isScheduledId(callId)) {
    scheduled = scheduledView(await scheduledCalls(env.DB).forAccount(accountId, callId));
    if (!scheduled.call_id) return { scheduled, call: null };
    callId = scheduled.call_id;
  }
  const deadline = Date.now() + waitSeconds * 1000;
  let row = await db.forAccount(accountId, callId);
  let qs = await db.questions(row.id);
  const openAtStart = qs.filter((q) => !q.answer).length;
  while (Date.now() < deadline && !callView(row, qs).finished && qs.filter((q) => !q.answer).length <= openAtStart) {
    await new Promise((r) => setTimeout(r, 1500));
    row = await db.forAccount(accountId, callId);
    qs = await db.questions(row.id);
  }
  return { scheduled, call: callView(row, qs, await db.callbacksFor(row.id)) };
}

/** followCall's result as one object: the call (with its schedule), or a schedule not dialed yet. */
export function followedView({ scheduled, call }: Awaited<ReturnType<typeof followCall>>) {
  if (!call) return { scheduled: scheduled!, finished: ['failed', 'canceled'].includes(scheduled!.status) };
  return scheduled ? { ...call, scheduled } : call;
}

/** Recent calls, newest first, after the scheduled calls that have not dialed yet. */
export async function listCalls(env: Env, accountId: string, limit: number) {
  const [rows, upcoming] = await Promise.all([calls(env.DB).list(accountId, limit), scheduledCalls(env.DB).upcoming(accountId)]);
  return { calls: rows.map((r) => callView(r, [])), scheduled: upcoming.map(scheduledView) };
}

export async function balanceView(env: Env, account: Account) {
  const balance = await accounts(env.DB).balanceCents(account.id);
  const price = pricePerMinute(env);
  const reload = await reloadOf(env.DB, account.id);
  const owned = await numbers(env).views(account.id);
  return {
    balance: dollars(balance),
    balance_cents: balance,
    price_per_minute: dollars(price),
    // Destinations billed at their own price instead (the UAE, Japan).
    price_per_minute_by_country: Object.fromEntries(Object.entries(DESTINATION_PRICE_CENTS).map(([c, cents]) => [c, dollars(cents)])),
    minutes_left: Math.floor(balance / price),
    phone_number: owned[0]?.number ?? null,
    numbers: owned,
    email: account.email,
    monthly_reload: reload ? { amount: dollars(reload.cents), status: reload.status, next: reload.renewsAt ? new Date(reload.renewsAt).toISOString().slice(0, 10) : null } : null,
  };
}

export const categoriesView = (intake: Catalog) => ({ categories: intake.categories.map((c) => ({ slug: c.slug, name: c.name, examples: c.examples })) });

/** What a kind of call needs before dialing, and which of that the saved profile already has. */
export async function requirementsView(env: Env, intake: Catalog, accountId: string, slug: string) {
  const category = intake.bySlug(slug);
  if (!category) throw new CallError(`unknown category; one of: ${intake.slugs.join(', ')}`, 404);
  const profile = await profiles(env.DB).get(accountId);
  const fields = category.fields.map((f) => ({
    key: f.key,
    label: f.label,
    required: f.required,
    ask: f.ask,
    from_profile: f.profile ?? null,
    known: Boolean(f.profile && profile[f.profile]),
  }));
  return { category: category.slug, name: category.name, fields };
}

export async function profileView(env: Env, intake: Catalog, accountId: string) {
  const saved = await profiles(env.DB).get(accountId);
  const profile = Object.fromEntries(intake.profileKeys.filter((k) => saved[k]).map((k) => [k, saved[k]]));
  const missing = intake.profileKeys.filter((k) => !profile[k] && !PROFILE_FIELDS[k].optional);
  return { profile, missing };
}

/** Merges into the saved profile; an empty string removes a field. */
export async function saveProfile(env: Env, intake: Catalog, accountId: string, fields: Record<string, string | undefined>) {
  const saved = await profiles(env.DB).update(accountId, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Record<string, string>);
  return { profile: Object.fromEntries(intake.profileKeys.filter((k) => saved[k]).map((k) => [k, saved[k]])) };
}

/** Rings the user (or `phone`) and patches them into a live call, to take it over or listen in. */
export async function connectPerson(env: Env, accountId: string, callId: string, opts: { phone?: string; mode: 'join' | 'listen' }) {
  const row = await calls(env.DB).forAccount(accountId, callId);
  if (!ACTIVE.includes(row.status) || !row.answered_at) throw new CallError('the call is not live', 409);
  let phone: string | undefined;
  if (opts.phone) {
    const p = checkDialable(opts.phone);
    if (!p.ok) throw new CallError(`phone: ${p.reason}`);
    if (!(await mayCall(env.DB, accountId, p))) throw new CallError(`phone: calling ${p.country} needs a number there (call4me_buy_number)`);
    phone = p.e164;
  }
  const res = await sessionFor(env, row.id).fetch('https://session/connect-person', { method: 'POST', body: JSON.stringify({ phone, mode: opts.mode }) });
  const { message } = (await res.json()) as { message: string };
  return { call_id: row.id, message };
}

export async function hangUp(env: Env, accountId: string, callId: string) {
  const row = await calls(env.DB).forAccount(accountId, callId);
  if (!ACTIVE.includes(row.status)) throw new CallError('the call is not live', 409);
  const res = await sessionFor(env, row.id).fetch('https://session/hang-up', { method: 'POST' });
  const { message } = (await res.json()) as { message: string };
  return { call_id: row.id, message };
}

/** Records the answer to an open question and hands it to the caller, who relays it on the line. */
export async function answerQuestion(env: Env, accountId: string, callId: string, questionId: string, answer: string) {
  const q = await calls(env.DB).answer(accountId, callId, questionId, answer.trim());
  await sessionFor(env, callId).fetch('https://session/answer', { method: 'POST', body: JSON.stringify({ id: q.id, question: q.question, answer: q.answer }) });
  return { id: q.id, question: q.question, answer: q.answer };
}
