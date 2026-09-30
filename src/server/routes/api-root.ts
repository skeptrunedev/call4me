import { Hono } from 'hono';
import { bearerAccount } from '../lib/auth';
import { siteUrl } from '../lib/auth-options';
import { origin, stripeFor, type AppEnv } from '../lib/context';
import { accounts, dollars } from '../services/accounts';
import { MIN_TOPUP_CENTS, parseAmountCents, TopupError } from '../services/topups';
import { carriesPayment, x402, type Payable } from '../services/x402';

/**
 * GET /api: call credits over x402. Without a payment it answers 402 with the USDC price of
 * `amount` dollars of credits (default $10, 10 to 500), payable to call4me's Stripe deposit
 * address on Base. With a payment it must also carry the account to credit, as
 * `Authorization: Bearer <call4me key or OAuth token>`; a payment without one is refused
 * before anything settles. Once settled, the credits land on the ledger (ref x402:<tx>) and
 * the response says the new balance.
 */
export const apiRoot = new Hono<AppEnv>();

const HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE', 'cache-control': 'private, no-store' };

const error = (code: string, message: string) => JSON.stringify({ error: { code, message } }, null, 2) + '\n';

apiRoot.get('/api', async (c) => {
  const site = siteUrl(origin(c));
  const amount = c.req.query('amount');
  let cents = MIN_TOPUP_CENTS;
  try {
    if (amount !== undefined) cents = parseAmountCents(amount);
  } catch (err) {
    if (err instanceof TopupError) return c.body(error('invalid_amount', `${err.message} (amount is in US dollars, 10 to 500)`), 400, HEADERS);
    throw err;
  }

  const shop = x402(c.env, stripeFor(c));
  const payTo = await shop.payTo();
  if (!payTo) return c.body(error('unavailable', `USDC payments are not available right now; add credits by card at ${site}/`), 503, HEADERS);

  const payable: Payable = {
    url: amount === undefined ? `${site}/api` : `${site}/api?amount=${cents / 100}`,
    description: `${dollars(cents)} of call4me call credits (phone calls your AI agent places), credited to the account named by Authorization: Bearer <call4me key or OAuth token>. Other amounts: ?amount=<dollars>, 10 to 500.`,
    mimeType: 'application/json',
    cents,
    payTo,
    route: { template: '/api' },
  };

  // Credits need an account: refuse a payment that names none before anything settles.
  const account = carriesPayment(c.req.raw) ? await bearerAccount(c) : null;
  if (carriesPayment(c.req.raw) && !account) {
    return c.body(error('unauthorized', `send Authorization: Bearer <call4me key or OAuth token> with the payment so the credits land on your account; see ${site}/auth.md`), 401, {
      ...HEADERS,
      'www-authenticate': `Bearer resource_metadata="${origin(c)}/.well-known/oauth-protected-resource"`,
    });
  }

  const outcome = await shop.collect(c.req.raw, payable, account ? { account_id: account.id } : {});
  if (!outcome.paid) return outcome.response;

  const ledger = accounts(c.env.DB);
  await ledger.post(account!.id, cents, 'topup', `x402:${outcome.transaction}`, `USDC (x402) from ${outcome.payer}`);
  const balance = await ledger.balanceCents(account!.id);
  const body = { credited: dollars(cents), credited_cents: cents, balance: dollars(balance), balance_cents: balance, transaction: outcome.transaction, payer: outcome.payer, mcp: `${site}/mcp` };
  return c.body(JSON.stringify(body, null, 2) + '\n', 200, { ...HEADERS, 'payment-response': outcome.paymentResponse });
});
