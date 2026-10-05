/**
 * Buy a phone number on someone's account, the way call4me_buy_number does for them: same carrier
 * order, same charge from their balance, pending while the carrier reviews it.
 *
 *   npm run number -- buy <email> <country> [--gift] [--local]
 *
 * --gift credits the price back, so the number costs them nothing today (its monthly renewal still
 * comes from their balance, as for any bought number). Needs TELNYX_API_KEY and
 * TELNYX_CONNECTION_ID in the environment.
 */
import { accounts } from '../src/server/services/accounts';
import { numbers } from '../src/server/services/numbers';
import { cliD1 } from './d1-cli';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [command, email, country] = args.filter((a) => !a.startsWith('--'));
if (command !== 'buy' || !email?.includes('@') || !/^[A-Za-z]{2}$/.test(country ?? '')) {
  console.error('usage: npm run number -- buy <email> <country> [--gift] [--local]');
  process.exit(1);
}
if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_CONNECTION_ID) {
  console.error('TELNYX_API_KEY and TELNYX_CONNECTION_ID must be set');
  process.exit(1);
}

const db = cliD1(flags.has('--local') ? '--local' : '--remote');
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
