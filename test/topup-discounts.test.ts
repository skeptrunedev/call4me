import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import { accounts } from '../src/server/services/accounts';
import { topups } from '../src/server/services/topups';
import { d1 } from './sqlite-d1';

async function setup(monthly: boolean, total = 1500) {
  const db = d1();
  const invoice = {
    id: 'in_initial', status: 'paid', subtotal: 3000, amount_paid: total,
    billing_reason: 'subscription_create',
    parent: { subscription_details: { subscription: 'sub_reload' } },
  } as Stripe.Invoice;
  const session = {
    id: 'cs_discount', status: 'complete', payment_status: total ? 'paid' : 'no_payment_required',
    mode: monthly ? 'subscription' : 'payment', amount_subtotal: 3000, amount_total: total,
    customer: 'cus_alice', customer_details: { email: 'alice@example.com' },
    invoice: monthly ? invoice : null,
    subscription: monthly ? {
      id: 'sub_reload', status: 'active', items: { data: [{ current_period_end: 1800000000, price: { unit_amount: 1000 }, quantity: 3 }] },
    } : null,
  } as unknown as Stripe.Checkout.Session;
  const stripe = { checkout: { sessions: { retrieve: async () => session } } } as unknown as Stripe;
  // Quantity was raised from one unit to three in Checkout, then discounted by 50%.
  await db.prepare(`INSERT INTO topups (id, account_id, email, amount_cents, monthly, stripe_session_id, created_at)
    VALUES ('topup_discount', 'acct_alice', 'alice@example.com', 1000, ?, 'cs_discount', 0)`).bind(monthly ? 1 : 0).run();
  return { db, service: topups(db, stripe), ledger: accounts(db), invoice };
}

for (const monthly of [false, true]) {
  test(`${monthly ? 'monthly' : 'one time'} discounted purchase grants face value credits once and reports the discounted payment`, async () => {
    const { service, ledger, invoice } = await setup(monthly);
    if (monthly) assert.equal(await service.invoicePaid(invoice), null, 'initial invoice may arrive before subscription is attached');
    const done = await service.fulfill('cs_discount');
    assert.equal(done?.topup.amount_cents, 3000);
    assert.equal(done?.paidCents, 1500);
    assert.equal(await ledger.balanceCents('acct_alice'), 3000);
    await service.fulfill('cs_discount');
    if (monthly) await service.invoicePaid(invoice);
    assert.equal(await ledger.balanceCents('acct_alice'), 3000, 'success page and both webhooks cannot double credit');
  });
}

test('discounted monthly renewal credits the subtotal and reports only money paid', async () => {
  const { service, ledger, invoice } = await setup(true);
  await service.fulfill('cs_discount');
  const renewal = { ...invoice, id: 'in_renewal', billing_reason: 'subscription_cycle' } as Stripe.Invoice;
  assert.deepEqual(await service.invoicePaid(renewal), { accountId: 'acct_alice', cents: 1500 });
  await service.invoicePaid(renewal);
  assert.equal(await ledger.balanceCents('acct_alice'), 6000);
  assert.equal(await service.invoicePaid({ ...renewal, id: 'in_unpaid', status: 'open' }), null);
  assert.equal(await ledger.balanceCents('acct_alice'), 6000);
});

test('a fully discounted paid invoice still grants purchased credits', async () => {
  const { service, ledger, invoice } = await setup(true, 0);
  assert.equal((await service.fulfill('cs_discount'))?.paidCents, 0);
  await service.invoicePaid({ ...invoice, id: 'in_free_renewal', billing_reason: 'subscription_cycle' });
  assert.equal(await ledger.balanceCents('acct_alice'), 6000);
});
