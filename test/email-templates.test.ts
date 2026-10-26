import assert from 'node:assert/strict';
import test from 'node:test';
import { runDrip, STEPS, templateFor, unknownPlaceholders } from '../src/server/services/drip';
import { d1 } from './sqlite-d1';

const welcome = STEPS.find((s) => s.id === 'welcome')!;

/** Every email the drip would send, captured instead of sent. */
function capture() {
  const sent: { to: string; subject: string; text: string; html?: string }[] = [];
  return { sent, messenger: { sendEmail: async (to: string, subject: string, text: string, html?: string) => void sent.push({ to, subject, text, html }), sendSms: async () => {} } };
}

const drip = (db: D1Database, messenger: ReturnType<typeof capture>['messenger']) =>
  runDrip({ db, messenger: messenger as never, origin: 'https://call4.me', secret: 'test-secret', start: 0 });

test('the migration seeds the welcome copy, the same as the code default', async () => {
  const db = d1();
  assert.deepEqual(await templateFor(db, welcome), { subject: welcome.template.subject, body: welcome.template.body });
  assert.match(welcome.template.body, /^hey, I'm Nick, the creator of call4me\./);
});

test('a stored template is what goes out, with its placeholders filled', async () => {
  const db = d1();
  await db.prepare(`UPDATE email_templates SET subject = ?, body = ? WHERE key = 'welcome'`).bind('hi from {host}', 'new copy. credits: {addCredits}\n\n- Nick').run();
  const { sent, messenger } = capture();
  await drip(db, messenger);
  const alice = sent.find((m) => m.to === 'alice@example.com')!;
  assert.equal(alice.subject, 'hi from call4.me');
  assert.match(alice.text, /^new copy\. credits: call4\.me\/add\/acct_alice-[0-9a-f]{16}\n\n- Nick/);
  assert.ok(alice.html?.includes('<a href="https://call4.me/add/acct_alice-'));
});

test('a stored template with an unknown placeholder is ignored for the default', async () => {
  const db = d1();
  await db.prepare(`UPDATE email_templates SET body = ? WHERE key = 'welcome'`).bind('typo: {addCredit}').run();
  assert.deepEqual(unknownPlaceholders({ subject: 'x', body: 'typo: {addCredit}' }), ['addCredit']);
  const { sent, messenger } = capture();
  await drip(db, messenger);
  assert.ok(!sent.some((m) => m.text.includes('{addCredit}')));
  assert.ok(sent[0].text.startsWith("hey, I'm Nick, the creator of call4me."));
});

/** A mail server that refuses one address the way Fastmail does, and delivers the rest. */
function rejecting(address: string, error: string) {
  const { sent, messenger } = capture();
  return {
    sent,
    messenger: {
      ...messenger,
      sendEmail: async (to: string, subject: string, text: string, html?: string) => {
        if (to === address) throw new Error(error);
        return messenger.sendEmail(to, subject, text, html);
      },
    },
  };
}

const userUnknown = 'Invalid RCPT TO: <alice@example.com> 550 5.1.1 <alice@example.com>: Recipient address rejected: User unknown in virtual mailbox table';

test('an address the mail server rejects outright is not retried, and gets no more email', async () => {
  const db = d1();
  const { sent, messenger } = rejecting('alice@example.com', userUnknown);
  // Bob gets both steps (welcome, and first-call since neither has called); Alice is dropped after the first.
  assert.deepEqual(await drip(db, messenger), { sent: STEPS.length, failed: 1 });
  assert.deepEqual(await drip(db, messenger), { sent: 0, failed: 0 });
  assert.deepEqual(sent.map((m) => m.to), STEPS.map(() => 'bob@example.com'));
  const alice = await db.prepare(`SELECT email_opt_out FROM accounts WHERE id = 'acct_alice'`).first<{ email_opt_out: number }>();
  assert.equal(alice!.email_opt_out, 1);
});

test('a temporary failure is retried on the next run', async () => {
  const db = d1();
  const { sent, messenger } = rejecting('alice@example.com', 'Invalid RCPT TO: <alice@example.com> 451 4.3.0 try again later');
  // Every step is tried for Alice on every run; Bob gets each step once.
  assert.deepEqual(await drip(db, messenger), { sent: STEPS.length, failed: STEPS.length });
  assert.deepEqual(await drip(db, messenger), { sent: 0, failed: STEPS.length });
  const alice = await db.prepare(`SELECT email_opt_out FROM accounts WHERE id = 'acct_alice'`).first<{ email_opt_out: number }>();
  assert.equal(alice!.email_opt_out, 0);
  assert.deepEqual(sent.map((m) => m.to), STEPS.map(() => 'bob@example.com'));
});

test('the first-call nudge skips accounts that have placed a call', async () => {
  const db = d1();
  await db.prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, created_at) VALUES ('call_1', 'acct_alice', '+15555550100', 'Rosa', 'hours', '{}', 'completed', 1)`).run();
  const { sent, messenger } = capture();
  await drip(db, messenger);
  const nudges = sent.filter((m) => m.subject === STEPS.find((s) => s.id === 'first-call')!.template.subject).map((m) => m.to);
  assert.deepEqual(nudges, ['bob@example.com']);
});
