import { Hono } from 'hono';
import { z } from 'zod';
import { bearerAccount } from '../lib/auth';
import {
  answerInput,
  balancePath,
  callAnswerPath,
  callIdArg,
  callConnectPath,
  callHangUpPath,
  callPath,
  callsPath,
  categoryRequirementsPath,
  connectInput,
  followedIdArg,
  listLimitInput,
  placeCallInput,
  profileInput,
  profilePath,
  requirementsPath,
  scheduleCallInput,
  scheduledCallPath,
  scheduledCallsPath,
  scheduledIdArg,
  waitSecondsInput,
} from '../lib/call-schema';
import { origin, type AppContext, type AppEnv } from '../lib/context';
import { answerQuestion, balanceView, categoriesView, callView, connectPerson, followCall, followedView, hangUp, listCalls, profileView, requirementsView, saveProfile } from '../services/call-ops';
import { CallError } from '../services/calls';
import { placeCall } from '../services/dialer';
import { catalog } from '../services/intake';
import { ProfileError } from '../services/profiles';
import { NumberError } from '../services/numbers';
import { scheduledCalls, scheduledView } from '../services/scheduled';

/** Calls, the balance and the caller profile over HTTP: the same operations as the MCP call tools. */
export const callRoutes = new Hono<AppEnv>();

const intake = catalog('agents');
const placeInput = placeCallInput('agents');
const scheduleInput = scheduleCallInput('agents');
const profileFields = profileInput('agents');

const route = (path: string) => path.replace(/\{(\w+)\}/g, ':$1');

async function signedIn(c: AppContext) {
  c.header('cache-control', 'private, no-store');
  const account = await bearerAccount(c);
  if (!account) c.header('www-authenticate', `Bearer resource_metadata="${origin(c)}/.well-known/oauth-protected-resource"`);
  return account;
}

const unauthorized = (c: AppContext) => c.json({ error: 'sign in with a call4me API key or OAuth access token' }, 401);

/** A refusal keeps its own status; "Not calling yet" (422) lists exactly what to ask the user. */
function failure(c: AppContext, err: unknown) {
  if (err instanceof CallError || err instanceof NumberError) return c.json({ error: err.message }, err.status as 400);
  if (err instanceof ProfileError) return c.json({ error: err.message }, 400);
  throw err;
}

const invalid = (c: AppContext, error: z.ZodError) => c.json({ error: z.prettifyError(error) }, 400);
const badId = (c: AppContext) => c.json({ error: 'invalid id' }, 400);
const body = (c: AppContext) => c.req.json().catch(() => null);

callRoutes.get(balancePath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  return c.json(await balanceView(c.env, account));
});

callRoutes.get(requirementsPath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  return c.json(categoriesView(intake));
});

callRoutes.get(route(categoryRequirementsPath), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const category = c.req.param('category');
  if (!category) return badId(c);
  try {
    return c.json(await requirementsView(c.env, intake, account.id, category));
  } catch (err) {
    return failure(c, err);
  }
});

callRoutes.get(profilePath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  return c.json(await profileView(c.env, intake, account.id));
});

callRoutes.patch(profilePath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const input = profileFields.safeParse(await body(c));
  if (!input.success) return invalid(c, input.error);
  try {
    return c.json(await saveProfile(c.env, intake, account.id, input.data));
  } catch (err) {
    return failure(c, err);
  }
});

callRoutes.get(callsPath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const limit = listLimitInput.safeParse(c.req.query('limit') === undefined ? undefined : Number(c.req.query('limit')));
  if (!limit.success) return invalid(c, limit.error);
  const { calls, scheduled } = await listCalls(c.env, account.id, limit.data);
  return c.json({ calls: calls.map((v) => ({ ...v, transcript: undefined })), scheduled });
});

callRoutes.post(callsPath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const input = placeInput.safeParse(await body(c));
  if (!input.success) return invalid(c, input.error);
  try {
    return c.json(callView(await placeCall(c.env, origin(c), account, input.data), []), 201);
  } catch (err) {
    return failure(c, err);
  }
});

callRoutes.get(route(callPath), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const id = followedIdArg.safeParse(c.req.param('call_id'));
  if (!id.success) return badId(c);
  const wait = waitSecondsInput.safeParse(c.req.query('wait_seconds') === undefined ? undefined : Number(c.req.query('wait_seconds')));
  if (!wait.success) return invalid(c, wait.error);
  try {
    return c.json(followedView(await followCall(c.env, account.id, id.data, wait.data)));
  } catch (err) {
    return failure(c, err);
  }
});

callRoutes.post(route(callAnswerPath), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const id = callIdArg.safeParse(c.req.param('call_id'));
  if (!id.success) return badId(c);
  const input = answerInput.safeParse(await body(c));
  if (!input.success) return invalid(c, input.error);
  try {
    return c.json(await answerQuestion(c.env, account.id, id.data, input.data.question_id, input.data.answer));
  } catch (err) {
    return failure(c, err);
  }
});

callRoutes.post(route(callConnectPath), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const id = callIdArg.safeParse(c.req.param('call_id'));
  if (!id.success) return badId(c);
  const input = connectInput.safeParse((await body(c)) ?? {});
  if (!input.success) return invalid(c, input.error);
  try {
    return c.json(await connectPerson(c.env, account.id, id.data, input.data));
  } catch (err) {
    return failure(c, err);
  }
});

callRoutes.post(route(callHangUpPath), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const id = callIdArg.safeParse(c.req.param('call_id'));
  if (!id.success) return badId(c);
  try {
    return c.json(await hangUp(c.env, account.id, id.data));
  } catch (err) {
    return failure(c, err);
  }
});

callRoutes.post(scheduledCallsPath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const input = scheduleInput.safeParse(await body(c));
  if (!input.success) return invalid(c, input.error);
  const { call_at, ...call } = input.data;
  try {
    return c.json(scheduledView(await scheduledCalls(c.env.DB).schedule(account, call, call_at, 'agents')), 201);
  } catch (err) {
    return failure(c, err);
  }
});

callRoutes.delete(route(scheduledCallPath), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const id = scheduledIdArg.safeParse(c.req.param('scheduled_id'));
  if (!id.success) return badId(c);
  try {
    return c.json(scheduledView(await scheduledCalls(c.env.DB).cancel(account.id, id.data)));
  } catch (err) {
    return failure(c, err);
  }
});
