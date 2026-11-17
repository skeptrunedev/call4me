/**
 * Give every live monthly reload's charges the call4me card-statement descriptor.
 *
 *   npm run reload-descriptors            # lists what would change
 *   npm run reload-descriptors -- --apply # changes it
 *
 * A subscription's charges take their descriptor from its product (services/topups.ts). New
 * reloads share one credits product that carries it; reloads bought before that each have their
 * own product with none, so they still bill as the shared Stripe account's SKEPTRUNE.COM. This
 * sets RELOAD_STATEMENT_DESCRIPTOR on those products, which only changes the statement text of
 * their next charges. Safe to run again: products that already carry it are skipped.
 *
 * Needs STRIPE_CALL4ME_KEY (call4me's Stripe key) in the environment.
 */
import { makeStripe, RELOAD_STATEMENT_DESCRIPTOR } from '../src/server/services/topups';
import { cliD1 } from './d1-cli';

const apply = process.argv.includes('--apply');
const key = process.env.STRIPE_CALL4ME_KEY;
if (!key) {
  console.error('STRIPE_CALL4ME_KEY must be set');
  process.exit(1);
}
const stripe = makeStripe(key);
const db = cliD1('--remote');

// The live reloads, as services/topups.ts counts them (LIVE_RELOAD).
const { results } = await db
  .prepare(`SELECT subscription_id FROM reloads WHERE status NOT IN ('canceled', 'incomplete_expired')`)
  .bind()
  .all<{ subscription_id: string }>();

let changed = 0;
let already = 0;
for (const { subscription_id } of results) {
  const sub = await stripe.subscriptions.retrieve(subscription_id, { expand: ['items.data.price.product'] });
  for (const item of sub.items.data) {
    const product = item.price.product;
    if (typeof product === 'string' || product.deleted) continue;
    if (product.statement_descriptor === RELOAD_STATEMENT_DESCRIPTOR) {
      already++;
      continue;
    }
    console.log(`${apply ? 'setting' : 'would set'} ${product.id} (${sub.id}, ${sub.status}): ${product.statement_descriptor ?? 'none'} -> ${RELOAD_STATEMENT_DESCRIPTOR}`);
    if (apply) await stripe.products.update(product.id, { statement_descriptor: RELOAD_STATEMENT_DESCRIPTOR });
    changed++;
  }
}
console.log(`${results.length} live reloads: ${changed} ${apply ? 'updated' : 'to update'}, ${already} already set`);
