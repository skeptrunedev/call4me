/**
 * Buy a phone number on someone's account, the way call4me_buy_number does for them: same carrier
 * order, same charge from their balance, pending while the carrier reviews it.
 *
 *   npm run number -- buy <email> <country> [--gift] [--local]
 *   npm run number -- share|unshare <number> [--local]
 *
 * --gift credits the price back, so the number costs them nothing today (its monthly renewal still
 * comes from their balance, as for any bought number). buy needs TELNYX_API_KEY and
 * TELNYX_CONNECTION_ID in the environment.
 *
 * share lets every account call that number's country from it (services/numbers.ts sharedNumber);
 * it stays on its account, which keeps paying for it. unshare makes it that account's own again.
 */
import { checkDialable, formatPhone } from '../src/server/lib/phone';
import { accounts } from '../src/server/services/accounts';
import { numbers } from '../src/server/services/numbers';
import { cliD1 } from './d1-cli';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
// buy takes an email, share and unshare a phone number.
const [command, target, country] = args.filter((a) => !a.startsWith('--'));
const db = cliD1(flags.has('--local') ? '--local' : '--remote');

if (command === 'share' || command === 'unshare') {
  const parsed = checkDialable(target ?? '');
  if (!parsed.ok) {
    console.error('usage: npm run number -- share|unshare <number> [--local]');
    process.exit(1);
  }
  const row = await db.prepare(`SELECT n.id, n.country, a.email FROM numbers n JOIN accounts a ON a.id = n.account_id WHERE n.phone_number = ? AND n.status = 'active'`).bind(parsed.e164).first<{ id: string; country: string; email: string }>();
  if (!row) {
    console.error(`${parsed.e164} is not an active number`);
    process.exit(1);
  }
  await db.prepare(`UPDATE numbers SET shared = ? WHERE id = ?`).bind(command === 'share' ? 1 : 0, row.id).run();
  console.log(command === 'share' ? `${formatPhone(parsed.e164)} is shared: every account can call ${row.country} from it (paid by ${row.email})` : `${formatPhone(parsed.e164)} is ${row.email}'s own again`);
  process.exit(0);
}

const email = target;
if (command !== 'buy' || !email?.includes('@') || !/^[A-Za-z]{2}$/.test(country ?? '')) {
  console.error('usage: npm run number -- buy <email> <country> [--gift] [--local]\n       npm run number -- share|unshare <number> [--local]');
  process.exit(1);
}
if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_CONNECTION_ID) {
  console.error('TELNYX_API_KEY and TELNYX_CONNECTION_ID must be set');
  process.exit(1);
}

const env = { DB: db, TELNYX_API_KEY: process.env.TELNYX_API_KEY, TELNYX_CONNECTION_ID: process.env.TELNYX_CONNECTION_ID } as unknown as Env;
const ledger = accounts(db);
const account = await ledger.byEmail(email.trim().toLowerCase());
if (!account) {
  console.error(`no account for ${email}`);
  process.exit(1);
}

const bought = await numbers(env).buy(account, { country });
const view = bought.number ?? bought.pending!;
const row = await db.prepare(`SELECT id FROM numbers WHERE account_id = ? AND phone_number = ? ORDER BY created_at DESC LIMIT 1`).bind(account.id, view.e164).first<{ id: string }>();
const paid = row ? await db.prepare(`SELECT -amount_cents AS cents FROM ledger WHERE ref = ?`).bind(`number:${row.id}:buy`).first<{ cents: number }>() : null;
if (flags.has('--gift') && row && paid?.cents) {
  await ledger.post(account.id, paid.cents, 'adjustment', `number:${row.id}:gift`, `${view.country_name} number ${view.number}, on us`);
}
const balance = await ledger.balanceCents(account.id);
console.log(
  `${bought.pending ? 'ordered, waiting on the carrier' : 'bought'}: ${view.number} (${view.country_name} ${view.type}, ${view.monthly}/month) for ${email}` +
    `${flags.has('--gift') ? `, gifted $${((paid?.cents ?? 0) / 100).toFixed(2)}` : ''}. balance: $${(balance / 100).toFixed(2)}`,
);
