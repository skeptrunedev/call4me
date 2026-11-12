/**
 * A one-time discount for one customer, and a Stripe checkout link with it already applied, for
 * a support email ("sorry about that, here's 10% off").
 *
 *   npm run discount -- <email> <percent> [--code CODE] [--monthly] [--local]
 *
 * The code is a coupon (percent off, once, one redemption) behind a promotion code that only the
 * customer's own Stripe customer can use, so a forwarded email gets nobody else a discount. The
 * link is the checkout the add-credits button starts (services/topups.ts): $10 units, quantity
 * adjustable on Stripe's page, and the credits are the full face value bought, not the discounted
 * price. One-time unless --monthly. Stripe expires a checkout link after 24 hours; the code still
 * works typed at checkout after that, and running this again with the same code makes a new link.
 *
 * Needs STRIPE_CALL4ME_KEY (call4me's Stripe key) in the environment. The customer must have paid
 * once, which is what gives them a Stripe customer to tie the code to.
 */
import type Stripe from 'stripe';
import { accounts } from '../src/server/services/accounts';
import { makeStripe, topups, MIN_TOPUP_CENTS } from '../src/server/services/topups';
import { cliD1 } from './d1-cli';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const code = option('--code')?.trim().toUpperCase();
const [email, percentArg] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--code');
const percent = Number(percentArg);
if (!email?.includes('@') || !Number.isInteger(percent) || percent < 1 || percent > 90 || (code !== undefined && !/^[A-Z0-9]{3,20}$/.test(code))) {
  console.error('usage: npm run discount -- <email> <percent (1 to 90)> [--code CODE] [--monthly] [--local]');
  process.exit(1);
}
const key = process.env.STRIPE_CALL4ME_KEY;
if (!key) {
  console.error('STRIPE_CALL4ME_KEY must be set');
  process.exit(1);
}

const db = cliD1(flag('--local') ? '--local' : '--remote');
const account = await accounts(db).byEmail(email.trim().toLowerCase());
if (!account) {
  console.error(`no account for ${email}`);
  process.exit(1);
}
const customer = (await db.prepare(`SELECT stripe_customer_id FROM accounts WHERE id = ?`).bind(account.id).first<{ stripe_customer_id: string | null }>())?.stripe_customer_id;
if (!customer) {
  console.error(`${email} has never paid, so there is no Stripe customer to tie a code to`);
  process.exit(1);
}

const stripe = makeStripe(key);
// A readable default: the first word of their name (or email) and the percent, e.g. ALEX10.
const name = (account.display_name ?? account.email).split(/[\s@._+-]/)[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
const promo = code ?? `${name || 'CALL4ME'}${percent}`;

// Reuse the code when this customer already has it (a fresh link after the last one expired).
let existing: Stripe.PromotionCode | undefined;
for await (const candidate of stripe.promotionCodes.list({ code: promo, limit: 100, expand: ['data.promotion.coupon'] })) {
  const owner = typeof candidate.customer === 'string' ? candidate.customer : candidate.customer?.id;
  if (owner !== customer) {
    console.error(`the code ${promo} already belongs to someone else; pick another with --code`);
    process.exit(1);
  }
  existing = candidate;
}
if (existing && !existing.active) {
  console.error(`${promo} was already used (or switched off); pick another with --code`);
  process.exit(1);
}
const existingCoupon = existing?.promotion.coupon;
if (existing && typeof existingCoupon === 'object' && existingCoupon?.percent_off !== percent) {
  console.error(`${promo} is already ${existingCoupon?.percent_off}% off for ${email}; pick another with --code`);
  process.exit(1);
}
if (!existing) {
  const coupon = await stripe.coupons.create({ name: `call4me ${percent}% off`, percent_off: percent, duration: 'once', max_redemptions: 1, metadata: { app: 'callbay', account_id: account.id } });
  await stripe.promotionCodes.create({ promotion: { type: 'coupon', coupon: coupon.id }, code: promo, customer, max_redemptions: 1, metadata: { app: 'callbay', account_id: account.id } });
}

const url = await topups(db, stripe).checkout({ amountCents: MIN_TOPUP_CENTS, monthly: flag('--monthly'), adjustable: true, origin: 'https://call4.me', account, promotionCode: promo });
console.log(`${existing ? 'reused' : 'made'} ${promo}: ${percent}% off one ${flag('--monthly') ? 'monthly reload (its first payment)' : 'top-up'}, only for ${email}`);
console.log(`checkout with it applied (expires in 24 hours): ${url}`);
