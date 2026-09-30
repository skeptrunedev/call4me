import { Hono } from 'hono';
import { field, origin, ownerKey, stripeFor, viewerKey, type AppContext, type AppEnv } from '../lib/context';
import { accountPrompt, callPrompt, installPrompt, privacyPrompt } from '../lib/prompts';
import { callView } from '../mcp/server';
import { accounts, type Account } from '../services/accounts';
import { calls, CallError } from '../services/calls';
import { pricePerMinute } from '../services/dialer';
import { NumberError, numbers } from '../services/numbers';
import { MIN_TOPUP_CENTS, parseAmountCents, reloadOf, topups, TopupError } from '../services/topups';
import { validUnsubscribe } from '../services/drip';
import { AccountPage, CallPage, NewKeyPage } from '../views/account';
import { HomePage, MessagePage, PrivacyPage, RulesPage, TermsPage, UnsubscribePage, WelcomePage } from '../views/public';
import { ExamplesPage } from '../views/examples';

export const pub = new Hono<AppEnv>();

const signedIn = (c: AppContext) => Boolean(c.get('account'));
const home = async (c: AppContext, extra: { error?: string; amount?: string } = {}, status: 200 | 400 = 200) =>
  c.html(
    <HomePage origin={origin(c)} pricePerMinuteCents={pricePerMinute(c.env)} signedIn={signedIn(c)} installPrompt={installPrompt(origin(c), await viewerKey(c))} countries={await numbers(c.env).offers()} {...extra} />,
    status,
  );

pub.get('/', (c) => home(c));
pub.get('/examples', (c) => c.html(<ExamplesPage signedIn={signedIn(c)} />));

/**
 * "add funds": straight to Stripe, signed in or not. Credits come in $10 units (the buyer
 * picks how many there) and reload monthly by default, like the form. Signed out, Stripe
 * collects the email; the credits land on the account for that email, which the buyer gets
 * by signing in with it (or claims from the welcome page under another sign-in).
 */
pub.post('/add-funds', async (c) => {
  const url = await topups(c.env.DB, stripeFor(c)).checkout({ amountCents: MIN_TOPUP_CENTS, monthly: true, adjustable: true, origin: origin(c), account: c.get('account') ?? undefined });
  return c.redirect(url, 303);
});

/** The amount form on the home page; works signed out too (see /add-funds). */
pub.post('/buy', async (c) => {
  const form = await c.req.formData();
  const amount = field(form, 'amount', 20);
  try {
    const url = await topups(c.env.DB, stripeFor(c)).checkout({ amountCents: parseAmountCents(amount), monthly: form.get('monthly') === 'on', origin: origin(c), account: c.get('account') ?? undefined });
    return c.redirect(url, 303);
  } catch (err) {
    if (err instanceof TopupError) return home(c, { error: err.message, amount }, 400);
    throw err;
  }
});

pub.get('/welcome', async (c) => {
  const sessionId = c.req.query('session_id');
  if (!sessionId) return c.redirect('/', 302);
  const t = topups(c.env.DB, stripeFor(c));
  const done = await t.fulfill(sessionId);
  if (!done) return c.html(<WelcomePage pending apiKey={null} installPrompt="" balanceCents={0} email="" />);
  const viewer = c.get('account');
  // Paid signed out: the credits wait on the account for the checkout email. Signing in with
  // that email opens it; signing in any other way brings the buyer back here to claim it.
  if (!viewer) {
    const balance = await accounts(c.env.DB).balanceCents(done.account.id);
    return c.html(<WelcomePage signedOut apiKey={null} installPrompt="" balanceCents={balance} email={done.account.email} next={`/welcome?session_id=${encodeURIComponent(sessionId)}`} />);
  }
  const owner = viewer.id === done.account.id || (await t.claim(done.account.id, viewer)) ? viewer : null;
  if (!owner) return c.html(<MessagePage title="already claimed" message={`these credits belong to the account for ${done.account.email}. sign in with that email to use them.`} signedIn />, 409);
  const key = await ownerKey(c, owner);
  const balance = await accounts(c.env.DB).balanceCents(owner.id);
  return c.html(<WelcomePage apiKey={key} installPrompt={installPrompt(origin(c), key)} balanceCents={balance} email={owner.email} />);
});

// ---- account

async function accountPage(c: AppContext, account: Account, errors: { error?: string; numberError?: string } = {}) {
  const n = numbers(c.env);
  const [balance, rows, owned, offers, reload, key] = await Promise.all([
    accounts(c.env.DB).balanceCents(account.id),
    calls(c.env.DB).list(account.id, 50),
    n.views(account.id),
    n.offers(),
    reloadOf(c.env.DB, account.id),
    ownerKey(c, account),
  ]);
  return c.html(
    <AccountPage
      account={account}
      balanceCents={balance}
      pricePerMinuteCents={pricePerMinute(c.env)}
      numbers={owned}
      offers={offers}
      reload={reload}
      calls={rows.map((r) => callView(r, []))}
      apiKey={key}
      agentPrompt={accountPrompt(origin(c), key)}
      {...errors}
    />,
    errors.error || errors.numberError ? 400 : 200,
  );
}

pub.get('/account', (c) => {
  const account = c.get('account');
  return account ? accountPage(c, account) : c.redirect('/login?next=/account', 302);
});

pub.post('/account/funds', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/account', 302);
  const form = await c.req.formData();
  try {
    const url = await topups(c.env.DB, stripeFor(c)).checkout({ amountCents: parseAmountCents(field(form, 'amount', 20)), monthly: form.get('monthly') === 'on', origin: origin(c), account });
    return c.redirect(url, 303);
  } catch (err) {
    if (err instanceof TopupError) return accountPage(c, account, { error: err.message });
    throw err;
  }
});

pub.post('/account/numbers', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/account', 302);
  const form = await c.req.formData();
  try {
    await numbers(c.env).buy(account, { country: field(form, 'country', 2) });
    return c.redirect('/account', 303);
  } catch (err) {
    if (err instanceof NumberError) return accountPage(c, account, { numberError: err.message });
    throw err;
  }
});

pub.post('/account/numbers/release', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/account', 302);
  const form = await c.req.formData();
  try {
    await numbers(c.env).release(account, field(form, 'number', 40));
    return c.redirect('/account', 303);
  } catch (err) {
    if (err instanceof NumberError) return accountPage(c, account, { numberError: err.message });
    throw err;
  }
});

pub.post('/account/reload/stop', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/account', 302);
  await topups(c.env.DB, stripeFor(c)).stopReload(account.id);
  return c.redirect('/account', 303);
});

pub.get('/account/calls/:id', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/account', 302);
  const db = calls(c.env.DB);
  try {
    const row = await db.forAccount(account.id, c.req.param('id'));
    const call = callView(row, await db.questions(row.id));
    return c.html(<CallPage call={call} agentPrompt={callPrompt(origin(c), await ownerKey(c, account), call.id, call.business)} />);
  } catch (err) {
    if (err instanceof CallError) return c.html(<MessagePage title="not found" message="no such call on this account." signedIn />, 404);
    throw err;
  }
});

/** A new API key for key-in-URL MCP clients; the old one stops working. Shown once. */
pub.post('/account/key', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/account', 303);
  const key = await accounts(c.env.DB).rotateKey(account.id, c.env.BETTER_AUTH_SECRET);
  c.header('cache-control', 'private, no-store');
  return c.html(<NewKeyPage apiKey={key} installPrompt={installPrompt(origin(c), key)} />);
});

// Drip unsubscribe. GET only shows a confirm button: mail scanners open every link in an
// email, so the opt-out itself is a POST.
pub.get('/unsubscribe', async (c) => {
  const a = c.req.query('a') ?? '';
  const s = c.req.query('s') ?? '';
  if (!(await validUnsubscribe(c.env.BETTER_AUTH_SECRET, a, s))) return c.html(<MessagePage title="link not valid" message="this unsubscribe link is not valid." />, 400);
  return c.html(<UnsubscribePage accountId={a} sig={s} />);
});

pub.post('/unsubscribe', async (c) => {
  const form = await c.req.formData();
  const a = field(form, 'a', 100);
  if (!(await validUnsubscribe(c.env.BETTER_AUTH_SECRET, a, field(form, 's', 200)))) return c.html(<MessagePage title="link not valid" message="this unsubscribe link is not valid." />, 400);
  await c.env.DB.prepare(`UPDATE accounts SET email_opt_out = 1 WHERE id = ?`).bind(a).run();
  return c.html(<MessagePage title="unsubscribed" message="you won't get these emails anymore. your account and credits are unchanged." />);
});

pub.get('/rules', (c) => c.html(<RulesPage signedIn={signedIn(c)} />));
pub.get('/privacy', async (c) => c.html(<PrivacyPage signedIn={signedIn(c)} agentPrompt={privacyPrompt(origin(c), await viewerKey(c))} />));
pub.get('/terms', (c) => c.html(<TermsPage signedIn={signedIn(c)} />));
