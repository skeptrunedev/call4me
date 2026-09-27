import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { field, origin, stripeFor, type AppContext, type AppEnv } from '../lib/context';
import { newToken, now } from '../lib/ids';
import { sha256Hex } from '../lib/keys';
import { consoleMessenger, makeMessenger } from '../lib/messaging';
import { installPrompt } from '../lib/prompts';
import { callView } from '../mcp/server';
import { accounts, type Account } from '../services/accounts';
import { calls, CallError } from '../services/calls';
import { pricePerMinute } from '../services/dialer';
import { parseAmountCents, topups, TopupError } from '../services/topups';
import { AccountPage, CallPage, KeyRequestPage, LoginPage, NewKeyPage } from '../views/account';
import { HomePage, MessagePage, PrivacyPage, RulesPage, TermsPage, WelcomePage } from '../views/public';

export const pub = new Hono<AppEnv>();

/** The web session is the API key itself in an HttpOnly cookie: there is nothing else to log in with. */
export const KEY_COOKIE = 'cb_key';
const setKeyCookie = (c: AppContext, key: string) => setCookie(c, KEY_COOKIE, key, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 90 });

export async function accountFromCookie(c: AppContext) {
  const key = getCookie(c, KEY_COOKIE);
  return key ? accounts(c.env.DB).byKey(key) : null;
}

const signedIn = (c: AppContext) => Boolean(c.get('account'));

pub.get('/', (c) => c.html(<HomePage origin={origin(c)} pricePerMinuteCents={pricePerMinute(c.env)} signedIn={signedIn(c)} installPrompt={installPrompt(origin(c), null)} />));

pub.post('/buy', async (c) => {
  const form = await c.req.formData();
  const email = field(form, 'email', 200);
  const amount = field(form, 'amount', 20);
  const monthly = form.get('monthly') === 'on';
  const again = (error: string) =>
    c.html(<HomePage origin={origin(c)} pricePerMinuteCents={pricePerMinute(c.env)} signedIn={signedIn(c)} installPrompt={installPrompt(origin(c), null)} error={error} email={email} amount={amount} />, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return again('enter a valid email');
  try {
    const url = await topups(c.env.DB, stripeFor(c)).checkout({ amountCents: parseAmountCents(amount), monthly, origin: origin(c), email });
    return c.redirect(url, 303);
  } catch (err) {
    if (err instanceof TopupError) return again(err.message);
    throw err;
  }
});

pub.get('/welcome', async (c) => {
  const sessionId = c.req.query('session_id');
  if (!sessionId) return c.redirect('/', 302);
  const t = topups(c.env.DB, stripeFor(c));
  const done = await t.fulfill(sessionId);
  if (!done) return c.html(<WelcomePage pending apiKey={null} installPrompt="" balanceCents={0} email="" />);
  const key = await t.revealFirstKey(done.topup.id, done.account);
  if (key) setKeyCookie(c, key);
  const balance = await accounts(c.env.DB).balanceCents(done.account.id);
  return c.html(<WelcomePage apiKey={key} installPrompt={installPrompt(origin(c), key)} balanceCents={balance} email={done.account.email} />);
});

// ---- account

pub.get('/login', (c) => (signedIn(c) ? c.redirect('/account', 302) : c.html(<LoginPage />)));

pub.post('/login', async (c) => {
  const key = field(await c.req.formData(), 'key', 100);
  if (!(await accounts(c.env.DB).byKey(key))) return c.html(<LoginPage error="that key doesn't match an account" />, 400);
  setKeyCookie(c, key);
  return c.redirect('/account', 303);
});

pub.get('/logout', (c) => {
  deleteCookie(c, KEY_COOKIE, { path: '/' });
  return c.redirect('/', 302);
});

async function accountPage(c: AppContext, account: Account, error?: string) {
  const [balance, rows, number, reload] = await Promise.all([
    accounts(c.env.DB).balanceCents(account.id),
    calls(c.env.DB).list(account.id, 50),
    c.env.DB.prepare(`SELECT phone_number FROM accounts WHERE id = ?`).bind(account.id).first<{ phone_number: string | null }>(),
    topups(c.env.DB, stripeFor(c)).reload(account.id),
  ]);
  return c.html(
    <AccountPage account={account} balanceCents={balance} pricePerMinuteCents={pricePerMinute(c.env)} phoneNumber={number?.phone_number ?? null} reload={reload} calls={rows.map((r) => callView(r, []))} error={error} />,
    error ? 400 : 200,
  );
}

pub.get('/account', (c) => {
  const account = c.get('account');
  return account ? accountPage(c, account) : c.redirect('/login', 302);
});

pub.post('/account/funds', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login', 302);
  const form = await c.req.formData();
  try {
    const url = await topups(c.env.DB, stripeFor(c)).checkout({ amountCents: parseAmountCents(field(form, 'amount', 20)), monthly: form.get('monthly') === 'on', origin: origin(c), account });
    return c.redirect(url, 303);
  } catch (err) {
    if (err instanceof TopupError) return accountPage(c, account, err.message);
    throw err;
  }
});

pub.post('/account/reload/stop', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login', 302);
  await topups(c.env.DB, stripeFor(c)).stopReload(account.id);
  return c.redirect('/account', 303);
});

pub.get('/account/calls/:id', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login', 302);
  const db = calls(c.env.DB);
  try {
    const row = await db.forAccount(account.id, c.req.param('id'));
    return c.html(<CallPage call={callView(row, await db.questions(row.id))} />);
  } catch (err) {
    if (err instanceof CallError) return c.html(<MessagePage title="not found" message="no such call on this account." signedIn />, 404);
    throw err;
  }
});

// ---- lost keys: a single-use emailed link mints a new one

const RESET_TTL_MS = 60 * 60 * 1000;

pub.get('/key', (c) => c.html(<KeyRequestPage />));

pub.post('/key', async (c) => {
  const email = field(await c.req.formData(), 'email', 200).toLowerCase();
  const account = await accounts(c.env.DB).byEmail(email);
  if (account) {
    const token = newToken();
    await c.env.DB.prepare(`INSERT INTO key_resets (token_hash, account_id, expires_at) VALUES (?, ?, ?)`).bind(await sha256Hex(token), account.id, now() + RESET_TTL_MS).run();
    const messenger = c.env.SMTP_USER ? makeMessenger(c.env) : consoleMessenger;
    await messenger.sendEmail(
      account.email,
      'your new callbay key',
      `open this link to get a new callbay key (it works once, for an hour; your old key stops working when you open it):\n\n${origin(c)}/key/reset?token=${token}\n\nif you didn't ask for this, ignore this email.`,
    );
  }
  // Same answer either way, so the form doesn't reveal which emails have accounts.
  return c.html(<KeyRequestPage sent />);
});

pub.get('/key/reset', async (c) => {
  const token = c.req.query('token') ?? '';
  const hash = await sha256Hex(token);
  const r = await c.env.DB.prepare(`UPDATE key_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING account_id`).bind(now(), hash, now()).first<{ account_id: string }>();
  if (!r) return c.html(<MessagePage title="link expired" message="that link was already used or is more than an hour old. ask for a new one." />, 400);
  const key = await accounts(c.env.DB).rotateKey(r.account_id);
  setKeyCookie(c, key);
  return c.html(<NewKeyPage apiKey={key} installPrompt={installPrompt(origin(c), key)} />);
});

pub.get('/rules', (c) => c.html(<RulesPage signedIn={signedIn(c)} />));
pub.get('/privacy', (c) => c.html(<PrivacyPage signedIn={signedIn(c)} />));
pub.get('/terms', (c) => c.html(<TermsPage signedIn={signedIn(c)} />));
