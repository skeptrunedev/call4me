import { Hono } from 'hono';
import { z } from 'zod';
import { siteUrl } from '../lib/auth-options';
import { X402_CALL_MINUTES, x402CallInput, x402CallsPath } from '../lib/call-schema';
import { origin, stripeFor, type AppEnv } from '../lib/context';
import { accounts, dollars, type Account } from '../services/accounts';
import { callView } from '../services/call-ops';
import { CallError, calls } from '../services/calls';
import { placeCall, pricePerMinuteTo } from '../services/dialer';
import { carriesPayment, x402, type Payable } from '../services/x402';

/**
 * POST /api/x402/calls: place a call paid for in USDC, no call4me account needed. Without a
 * payment it answers 402 with the price of the call's max_minutes at the destination's
 * per-minute price. With one, the payer's wallet is the account (one per address, created on its
 * first call): once the payment verifies, the call is checked exactly as POST /api/calls checks
 * it, and a refusal ("Not calling yet", 422) answers before anything settles. Then the payment
 * settles, lands on the wallet's account as credits, and pays the call's hold like any other.
 * The response carries the account's API key so the agent follows the call on the regular
 * routes (GET /api/calls/{call_id}); minutes the call does not use stay as credits there.
 */
export const x402Calls = new Hono<AppEnv>();

const HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE', 'cache-control': 'private, no-store' };

const json = (o: unknown) => JSON.stringify(o, null, 2) + '\n';

/** The account behind a paying wallet: its address is the identity, under a non-deliverable email. */
const walletEmail = (payer: string) => `${payer.toLowerCase()}@x402.invalid`;

/** What an unpaid request is quoted from: as much of the body as reads, so a probe with none still gets its 402. */
function quote(raw: unknown): { to: string; minutes: number } {
  const body = (raw && typeof raw === 'object' ? raw : {}) as { to?: unknown; max_minutes?: unknown };
  const minutes = typeof body.max_minutes === 'number' && Number.isInteger(body.max_minutes) ? Math.min(Math.max(body.max_minutes, 1), X402_CALL_MINUTES.max) : X402_CALL_MINUTES.default;
  return { to: typeof body.to === 'string' ? body.to : '', minutes };
}

/** The example call the discovery listing shows, which must pass the body schema. */
const X402_CALL_EXAMPLE = {
  to: '+14155550123',
  business: 'Tartine Bakery',
  goal: 'Ask whether a country loaf is left today and what time they close.',
  category: 'general',
  details: { questions: 'Is a country loaf left today? What time do you close?' },
  on_behalf_of: 'Sam',
  max_minutes: 5,
};

/** The body's JSON Schema, nested in the extension's own schema (which carries the $schema). */
function x402CallBodySchema(): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(x402CallInput, { target: 'draft-2020-12', io: 'input' });
  delete schema.$schema;
  return schema;
}

x402Calls.post(x402CallsPath, async (c) => {
  const site = siteUrl(origin(c));
  const shop = x402(c.env, stripeFor(c));
  const payTo = await shop.payTo();
  if (!payTo) return c.body(json({ error: `USDC payments are not available right now; sign in at ${site}/ and use POST /api/calls` }), 503, HEADERS);

  const raw = await c.req.json().catch(() => null);
  const input = x402CallInput.safeParse(raw);
  const { to, minutes } = input.success ? { to: input.data.to, minutes: input.data.max_minutes ?? X402_CALL_MINUTES.default } : quote(raw);
  const price = pricePerMinuteTo(c.env, to);
  const cents = minutes * price;
  const payable: Payable = {
    url: `${site}${x402CallsPath}`,
    description: `A phone call to a business by call4me's AI caller: up to ${minutes} min at ${dollars(price)}/min. Returns the call id and an API key to follow it at /api/calls/{id}. Unused minutes stay as credits on the paying wallet's account.`,
    mimeType: 'application/json',
    cents,
    payTo,
    discovery: {
      input: { method: 'POST', body: X402_CALL_EXAMPLE, bodySchema: x402CallBodySchema() },
      output: {
        example: {
          call: { id: 'call_ab12cd34', status: 'dialing', finished: false, business: 'Tartine Bakery', number: '(415) 555-0123', calling_number: '(510) 555-0199', open_questions: [], outcome: null },
          api_key: 'cb_live_…',
          follow: `GET ${site}/api/calls/call_ab12cd34?wait_seconds=30 with Authorization: Bearer <api_key>`,
          credited: '$1.25',
          balance: '$0.00',
          transaction: '0x5f2c…',
          payer: '0x8a1e…',
        },
      },
    },
  };

  // A paid request must say which call it pays for; nothing settles until it does.
  if (carriesPayment(c.req.raw) && !input.success) {
    return c.body(json({ error: z.prettifyError(input.error) }), 400, HEADERS);
  }

  let account: Account | null = null;
  const call = input.success ? { ...input.data, max_minutes: minutes } : null;
  const metadata: Record<string, string> = { purpose: 'x402_call' };
  const outcome = await shop.collect(c.req.raw, payable, metadata, async (payer) => {
    account = await accounts(c.env.DB).ensure(walletEmail(payer));
    metadata.account_id = account.id;
    try {
      await calls(c.env.DB).validate(account, call!);
      return null;
    } catch (err) {
      if (err instanceof CallError) return c.body(json({ error: err.message }), err.status as 400, HEADERS);
      throw err;
    }
  });
  if (!outcome.paid) return outcome.response;

  const payer: Account = account!;
  const ledger = accounts(c.env.DB);
  await ledger.post(payer.id, cents, 'topup', `x402:${outcome.transaction}`, `USDC (x402) from ${outcome.payer} for a call`);
  const paid = {
    api_key: await ledger.promptKey(payer.id, c.env.BETTER_AUTH_SECRET),
    credited: dollars(cents),
    credited_cents: cents,
    transaction: outcome.transaction,
    payer: outcome.payer,
  };
  const headers = { ...HEADERS, 'payment-response': outcome.paymentResponse };
  const balance = async () => {
    const b = await ledger.balanceCents(payer.id);
    return { balance: dollars(b), balance_cents: b };
  };

  try {
    const row = await placeCall(c.env, origin(c), payer, call!);
    const follow = `GET ${site}/api/calls/${row.id}?wait_seconds=30 with Authorization: Bearer <api_key>`;
    return c.body(json({ call: callView(row, []), ...paid, follow, ...(await balance()) }), 201, headers);
  } catch (err) {
    // Paid but not placed: the credits stay on the account, and the key places it again on POST /api/calls.
    // Never a 402 here, which an x402 client would take as a new price to pay.
    if (!(err instanceof CallError)) console.error('x402 call failed after payment', outcome.transaction, err);
    const status = err instanceof CallError ? (err.status === 402 ? 409 : err.status) : 500;
    const message = err instanceof CallError ? err.message : 'call4me could not place the call.';
    return c.body(json({ error: `${message} The payment is kept as credits; place the call again with POST ${site}/api/calls and Authorization: Bearer <api_key>.`, ...paid, ...(await balance()) }), status as 400, headers);
  }
});
