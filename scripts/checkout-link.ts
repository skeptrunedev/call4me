/**
 * A Stripe checkout link that adds credits to one account, for a support email ("here's a link
 * for $10"). It is the checkout the add-credits button starts (services/topups.ts), tied to the
 * account, so the credits land there whoever opens it. Unlike discount.ts it needs no Stripe
 * customer, so it works for someone who has never paid. One-time unless --monthly; Stripe expires
 * the link after 24 hours, and running this again makes a new one.
 *
 *   npm run checkout-link -- <email> <dollars> [--monthly] [--local]
 *
 * Needs STRIPE_CALL4ME_KEY (call4me's Stripe key) in the environment.
 */
import { accounts } from '../src/server/services/accounts';
import { makeStripe, parseAmountCents, topups, TopupError } from '../src/server/services/topups';
import { cliD1 } from './d1-cli';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const [email, dollars] = args.filter((a) => !a.startsWith('--'));
const usage = 'usage: npm run checkout-link -- <email> <dollars> [--monthly] [--local]';
if (!email?.includes('@') || !dollars) {
  console.error(usage);
  process.exit(1);
}
let amountCents: number;
try {
  amountCents = parseAmountCents(dollars);
} catch (err) {
  console.error(err instanceof TopupError ? `${err.message}\n${usage}` : err);
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

const monthly = flag('--monthly');
const url = await topups(db, makeStripe(key)).checkout({ amountCents, monthly, origin: 'https://call4.me', account });
console.log(`$${(amountCents / 100).toFixed(2)} ${monthly ? 'monthly reload' : 'one-time top-up'} for ${account.email} (expires in 24 hours): ${url}`);
