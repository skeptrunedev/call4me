/**
 * Buy a phone number on someone's account, the way call4me_buy_number does for them: same carrier
 * order, same charge from their balance, pending while the carrier reviews it.
 *
 *   npm run number -- buy <email> <country> [--gift] [--local|--staging]
 *   npm run number -- adopt <email> <number> [--local|--staging]
 *   npm run number -- release <number>... [--local|--staging]
 *   npm run number -- share|unshare <number> [--local|--staging]
 *
 * adopt makes a US number already on our carrier account and connection the account's free first
 * number: one whose order the carrier finished after the first call that placed it stopped
 * waiting, before services/numbers.ts ensureIncluded recorded orders first.
 *
 * release gives numbers no account holds back to the carrier, so they stop billing: ones such an
 * order left behind. It refuses any number an account holds (pending or active), and any the
 * carrier doesn't have on this environment's connection.
 *
 * --gift credits the price back, so the number costs them nothing today (its monthly renewal still
 * comes from their balance, as for any bought number). buy needs TELNYX_API_KEY and
 * TELNYX_CONNECTION_ID in the environment.
 *
 * --staging works on staging's database (wrangler.staging.jsonc); give it staging's Telnyx app as
 * TELNYX_CONNECTION_ID so the number rings the staging workers, not production.
 *
 * share lets every account call that number's country from it (services/numbers.ts sharedNumber);
 * it stays on its account, which keeps paying for it. unshare makes it that account's own again.
 */
import { checkDialable, formatPhone } from '../src/server/lib/phone';
import { accounts } from '../src/server/services/accounts';
import { numbers } from '../src/server/services/numbers';
import { telnyx } from '../src/server/lib/telnyx';
import { cliD1 } from './d1-cli';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
// buy takes an email, share and unshare a phone number.
const [command, target, country] = args.filter((a) => !a.startsWith('--'));
const db = cliD1(flags.has('--local') ? '--local' : '--remote', flags.has('--staging') ? 'staging' : 'production');

if (command === 'share' || command === 'unshare') {
  const parsed = checkDialable(target ?? '');
  if (!parsed.ok) {
    console.error('usage: npm run number -- share|unshare <number> [--local|--staging]');
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

const usage = 'usage: npm run number -- buy <email> <country> [--gift] [--local|--staging]\n       npm run number -- adopt <email> <number> [--local|--staging]\n       npm run number -- release <number>... [--local|--staging]\n       npm run number -- share|unshare <number> [--local|--staging]';

if (command === 'release') {
  const listed = args.filter((a) => !a.startsWith('--')).slice(1);
  if (!listed.length || !process.env.TELNYX_API_KEY || !process.env.TELNYX_CONNECTION_ID) {
    console.error(listed.length ? 'TELNYX_API_KEY and TELNYX_CONNECTION_ID must be set' : usage);
    process.exit(1);
  }
  const carrier = telnyx({ TELNYX_API_KEY: process.env.TELNYX_API_KEY } as unknown as Env);
  let refused = 0;
  for (const number of listed) {
    const parsed = checkDialable(number);
    const e164 = parsed.ok ? parsed.e164 : number;
    const held = await db.prepare(`SELECT a.email, n.status FROM numbers n JOIN accounts a ON a.id = n.account_id WHERE n.phone_number = ? AND n.status IN ('pending', 'active')`).bind(e164).first<{ email: string; status: string }>();
    const owned = held ? null : await carrier.ownedNumber(e164);
    const reason = held ? `${held.email} holds it (${held.status})` : !owned ? 'the carrier has no such number on our account' : owned.connectionId !== process.env.TELNYX_CONNECTION_ID ? `it rings connection ${owned.connectionId}, not this environment's` : null;
    if (reason) {
      console.error(`kept ${formatPhone(e164)}: ${reason}`);
      refused++;
      continue;
    }
    await carrier.releaseNumber(e164);
    console.log(`released ${formatPhone(e164)}`);
  }
  process.exit(refused ? 1 : 0);
}

const email = target;
const adopting = command === 'adopt';
if (!(command === 'buy' || adopting) || !email?.includes('@') || !(adopting ? country : /^[A-Za-z]{2}$/.test(country ?? ''))) {
  console.error(usage);
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

if (adopting) {
  const view = await numbers(env).adoptIncluded(account, country!);
  console.log(`${view.number} is now ${email}'s free call4me number`);
  process.exit(0);
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
