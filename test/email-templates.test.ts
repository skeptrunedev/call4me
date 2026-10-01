import assert from 'node:assert/strict';
import test from 'node:test';
import { fill, runDrip, STEPS, templateFor, unknownPlaceholders } from '../src/server/services/drip';
import { parse } from '../scripts/email-template';
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

test('with no stored row, the code default goes out', async () => {
  const db = d1();
  await db.prepare(`DELETE FROM email_templates`).run();
  const { sent, messenger } = capture();
  await drip(db, messenger);
  assert.ok(sent[0].text.startsWith("hey, I'm Nick, the creator of call4me."));
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

test('fill replaces every placeholder and nothing else', () => {
  const email = fill({ subject: '{host}', body: 'a {addCredits} b {host} c {other}' }, { host: 'call4.me', addCredits: 'call4.me/add/x-y' });
  assert.equal(email.subject, 'call4.me');
  assert.equal(email.body, 'a call4.me/add/x-y b call4.me c {other}');
});

test('the CLI parses its commands and refuses bad ones', () => {
  assert.deepEqual(parse(['list']), { action: 'list', local: false });
  assert.deepEqual(parse(['show', 'welcome', '--local']), { action: 'show', key: 'welcome', local: true });
  assert.deepEqual(parse(['set', 'welcome', '--file', 'b.txt', '--subject', 'hi']), { action: 'set', key: 'welcome', file: 'b.txt', subject: 'hi', local: false });
  assert.match(parse(['set', 'welcome']) as string, /--file/);
  assert.match(parse(['show', 'nope']) as string, /no email called "nope"/);
  assert.match(parse([]) as string, /^usage/);
});
