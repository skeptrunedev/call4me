import { Hono } from 'hono';
import { bearerAccount } from '../lib/auth';
import { origin, type AppContext, type AppEnv } from '../lib/context';
import { buyNumberInput, confirmVerificationInput, numberPath, numbersPath, ownNumberInput, ownNumberPath, ownNumbersPath, ownNumberVerifyPath, releaseNumberInput, sendVerificationInput } from '../lib/number-schema';
import { NumberError, numbers } from '../services/numbers';

/** The account's phone numbers over HTTP: the same operations as the MCP number tools. */
export const numberRoutes = new Hono<AppEnv>();

async function signedIn(c: AppContext) {
  c.header('cache-control', 'private, no-store');
  const account = await bearerAccount(c);
  if (!account) c.header('www-authenticate', `Bearer resource_metadata="${origin(c)}/.well-known/oauth-protected-resource"`);
  return account;
}

const unauthorized = (c: AppContext) => c.json({ error: 'sign in with a call4me API key or OAuth access token' }, 401);

function failure(c: AppContext, err: unknown) {
  if (err instanceof NumberError) return c.json({ error: err.message }, err.status as 400);
  throw err;
}

numberRoutes.get(numbersPath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const n = numbers(c.env);
  const [owned, own, countries] = await Promise.all([n.views(account.id), n.ownViews(account.id), n.offers()]);
  return c.json({ numbers: owned, own_numbers: own, countries });
});

numberRoutes.post(numbersPath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const input = buyNumberInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'send JSON like {"country": "NL"}, optionally with "area_code"' }, 400);
  try {
    return c.json(await numbers(c.env).buy(account, { country: input.data.country, areaCode: input.data.area_code }), 201);
  } catch (err) {
    return failure(c, err);
  }
});

numberRoutes.delete(numberPath.replace('{number}', ':number'), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const input = releaseNumberInput.safeParse({ number: c.req.param('number') });
  if (!input.success) return c.json({ error: 'invalid number' }, 400);
  try {
    return c.json(await numbers(c.env).release(account, input.data.number));
  } catch (err) {
    return failure(c, err);
  }
});

numberRoutes.post(ownNumbersPath, async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const input = sendVerificationInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'send JSON like {"number": "+14155550123"}, optionally with "method": "sms" or "call", and "extension" for a call' }, 400);
  try {
    return c.json(await numbers(c.env).startVerification(account, input.data), 202);
  } catch (err) {
    return failure(c, err);
  }
});

numberRoutes.post(ownNumberVerifyPath.replace('{number}', ':number'), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const number = ownNumberInput.safeParse({ number: c.req.param('number') });
  const input = confirmVerificationInput.safeParse(await c.req.json().catch(() => null));
  if (!number.success) return c.json({ error: 'invalid number' }, 400);
  if (!input.success) return c.json({ error: 'send JSON like {"code": "123456"}' }, 400);
  try {
    return c.json(await numbers(c.env).confirmVerification(account, number.data.number, input.data.code));
  } catch (err) {
    return failure(c, err);
  }
});

numberRoutes.delete(ownNumberPath.replace('{number}', ':number'), async (c) => {
  const account = await signedIn(c);
  if (!account) return unauthorized(c);
  const input = ownNumberInput.safeParse({ number: c.req.param('number') });
  if (!input.success) return c.json({ error: 'invalid number' }, 400);
  try {
    return c.json(await numbers(c.env).removeOwn(account, input.data.number));
  } catch (err) {
    return failure(c, err);
  }
});
