import { Hono } from 'hono';
import { field, origin, stripeFor, type AppContext, type AppEnv } from '../lib/context';
import { installPrompt } from '../lib/prompts';
import { callView } from '../mcp/server';
import { accounts, type Account } from '../services/accounts';
import { calls, CallError } from '../services/calls';
import { pricePerMinute } from '../services/dialer';
import { parseAmountCents, reloadOf, topups, TopupError } from '../services/topups';
import { AccountPage, CallPage, NewKeyPage } from '../views/account';
import { HomePage, MessagePage, PrivacyPage, RulesPage, TermsPage, WelcomePage } from '../views/public';

export const pub = new Hono<AppEnv>();

const signedIn = (c: AppContext) => Boolean(c.get('account'));
const home = (c: AppContext, extra: { error?: string; amount?: string } = {}, status: 200 | 400 = 200) =>
  c.html(<HomePage origin={origin(c)} pricePerMinuteCents={pricePerMinute(c.env)} signedIn={signedIn(c)} installPrompt={installPrompt(origin(c), null)} {...extra} />, status);

pub.get('/', (c) => home(c));

/** Buying needs a signed-in account, so every payment lands on a known person. */
pub.post('/buy', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/', 303);
  const form = await c.req.formData();
  const amount = field(form, 'amount', 20);
  try {
    const url = await topups(c.env.DB, stripeFor(c)).checkout({ amountCents: parseAmountCents(amount), monthly: form.get('monthly') === 'on', origin: origin(c), account });
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
  // Only the account's owner sees its first key.
  const key = c.get('account')?.id === done.account.id ? await t.revealFirstKey(done.topup.id, done.account) : null;
  const balance = await accounts(c.env.DB).balanceCents(done.account.id);
  return c.html(<WelcomePage apiKey={key} installPrompt={installPrompt(origin(c), key)} balanceCents={balance} email={done.account.email} />);
});

// ---- account

async function accountPage(c: AppContext, account: Account, error?: string) {
  const [balance, rows, number, reload] = await Promise.all([
    accounts(c.env.DB).balanceCents(account.id),
    calls(c.env.DB).list(account.id, 50),
    c.env.DB.prepare(`SELECT phone_number FROM accounts WHERE id = ?`).bind(account.id).first<{ phone_number: string | null }>(),
    reloadOf(c.env.DB, account.id),
  ]);
  return c.html(
    <AccountPage account={account} balanceCents={balance} pricePerMinuteCents={pricePerMinute(c.env)} phoneNumber={number?.phone_number ?? null} reload={reload} calls={rows.map((r) => callView(r, []))} error={error} />,
    error ? 400 : 200,
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
    if (err instanceof TopupError) return accountPage(c, account, err.message);
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
    return c.html(<CallPage call={callView(row, await db.questions(row.id))} />);
  } catch (err) {
    if (err instanceof CallError) return c.html(<MessagePage title="not found" message="no such call on this account." signedIn />, 404);
    throw err;
  }
});

/** A new API key for key-in-URL MCP clients; the old one stops working. Shown once. */
pub.post('/account/key', async (c) => {
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/account', 303);
  const key = await accounts(c.env.DB).rotateKey(account.id);
  return c.html(<NewKeyPage apiKey={key} installPrompt={installPrompt(origin(c), key)} />);
});

pub.get('/rules', (c) => c.html(<RulesPage signedIn={signedIn(c)} />));
pub.get('/privacy', (c) => c.html(<PrivacyPage signedIn={signedIn(c)} />));
pub.get('/terms', (c) => c.html(<TermsPage signedIn={signedIn(c)} />));
