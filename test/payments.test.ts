import assert from 'node:assert/strict';
import test from 'node:test';
import { d1 } from './sqlite-d1';
import { notifyPayments } from '../src/server/services/payments';
import type { Messenger } from '../src/server/lib/messaging';

const ORIGIN = 'https://call4.me';
const NOV_18_944_AM_PT = Date.parse('2026-11-18T17:44:00Z');

function inbox(fail = () => false): Messenger & { sent: { to: string; subject: string; text: string }[] } {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    sent,
    async sendEmail(to, subject, text) {
      if (fail()) throw new Error('smtp down');
      sent.push({ to, subject, text });
    },
  };
}

async function post(db: D1Database, id: string, account: string, cents: number, kind: string, note: string | null, at: number) {
  await db.prepare(`INSERT INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, account, cents, kind, `ref:${id}`, note, at).run();
}

test('each payment emails Nick once, saying how it was paid and what the account has paid so far', async () => {
  const db = d1();
  await db.prepare(`UPDATE accounts SET display_name = 'Alice Ng' WHERE id = 'acct_alice'`).run();
  await post(db, 'l_card', 'acct_alice', 1000, 'topup', 'card', NOV_18_944_AM_PT);
  // Calls, holds and credits Nick gives are not payments.
  await post(db, 'l_hold', 'acct_alice', -200, 'hold', 'up to 2 min', NOV_18_944_AM_PT + 1);
  await post(db, 'l_gift', 'acct_bob', 2500, 'adjustment', 'feedback credits', NOV_18_944_AM_PT + 2);
  const mail = inbox();
  const to = ['me@skeptrune.com', 'nick@example.com'];

  assert.deepEqual(await notifyPayments({ db, messenger: mail, to, origin: ORIGIN }), { sent: 1, failed: 0 });
  assert.deepEqual(mail.sent.map((m) => m.to), to);
  assert.equal(mail.sent[0].subject, 'new Call for Me payment: $10.00 from alice@example.com');
  assert.equal(
    mail.sent[0].text,
    ['alice@example.com (Alice Ng) paid for $10.00 of credits (card).', 'their first payment', 'when: Nov 18, 9:44 AM PT', 'account: acct_alice', ORIGIN].join('\n'),
  );

  // Announced once: the next minute sends nothing for it.
  assert.deepEqual(await notifyPayments({ db, messenger: mail, to, origin: ORIGIN }), { sent: 0, failed: 0 });

  await post(db, 'l_reload', 'acct_alice', 2000, 'reload', 'monthly reload', NOV_18_944_AM_PT + 30 * 86_400_000);
  mail.sent.length = 0;
  assert.deepEqual(await notifyPayments({ db, messenger: mail, to: ['me@skeptrune.com'], origin: ORIGIN }), { sent: 1, failed: 0 });
  assert.match(mail.sent[0].text, /^alice@example\.com \(Alice Ng\) paid for \$20\.00 of credits \(monthly reload\)\.\npayment 2 from them, \$30\.00 in all\n/);
});

test('a payment whose email fails is sent again on the next run', async () => {
  const db = d1();
  await post(db, 'l_usdc', 'acct_bob', 500, 'topup', 'USDC (x402) from 0xabc', NOV_18_944_AM_PT);
  let down = true;
  const mail = inbox(() => down);
  assert.deepEqual(await notifyPayments({ db, messenger: mail, to: ['me@skeptrune.com'], origin: ORIGIN }), { sent: 0, failed: 1 });
  down = false;
  assert.deepEqual(await notifyPayments({ db, messenger: mail, to: ['me@skeptrune.com'], origin: ORIGIN }), { sent: 1, failed: 0 });
  assert.equal(mail.sent[0].subject, 'new Call for Me payment: $5.00 from bob@example.com');
  assert.match(mail.sent[0].text, /\(USDC \(x402\) from 0xabc\)/);
});

test('an account with no real email is named by its name, and nothing is claimed without anyone to tell', async () => {
  const db = d1();
  await db.prepare(`INSERT INTO accounts (id, email, display_name, created_at) VALUES ('acct_x', 'x_123@x.invalid', 'Sam', 0)`).run();
  await post(db, 'l_x', 'acct_x', 1000, 'topup', 'card', NOV_18_944_AM_PT);
  const mail = inbox();
  assert.deepEqual(await notifyPayments({ db, messenger: mail, to: [], origin: ORIGIN }), { sent: 0, failed: 0 });
  assert.deepEqual(await notifyPayments({ db, messenger: mail, to: ['me@skeptrune.com'], origin: ORIGIN }), { sent: 1, failed: 0 });
  assert.equal(mail.sent[0].subject, 'new Call for Me payment: $10.00 from Sam (no email)');
});
