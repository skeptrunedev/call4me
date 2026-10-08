import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleRecipients, fingerprint, scheduleCampaign, verifyCampaign, type Campaign } from '../scripts/campaign';
import { d1 } from './sqlite-d1';

function fixture() {
  const campaign: Campaign = { version: 1, createdAt: new Date().toISOString(),
    sendAt: new Date(Date.now() + 86400000).toISOString().replace('.000Z', 'Z'), subject: 'Approved message', fingerprint: '',
    recipients: ['one', 'two'].map(accountId => ({ accountId, email: `${accountId}@example.com`, text: 'approved copy', state: 'prepared' })) };
  campaign.fingerprint = fingerprint(campaign);
  const events: string[] = [];
  const savedStates: string[][] = [];
  const records: { id: string; emailId: string; sendAt: string; undoStatus: string }[] = [];
  const client = {
    async createDraft({ to }: { to: string }) { events.push(`draft:${to}`); return { id: `email:${to}` }; },
    async scheduleDraft({ id, sendAt }: { id: string; sendAt: string }) {
      events.push(`schedule:${id}`);
      const record = { id: `submission:${id}`, emailId: id, sendAt, undoStatus: 'pending' };
      records.push(record);
      return { submissionId: record.id };
    },
    async submissionsForEmail(emailId: string) { events.push(`inspect:${emailId}`); return records.filter(r => r.emailId === emailId); },
    async submissions(ids: string[]) { return { list: records.filter(r => ids.includes(r.id)) }; },
  };
  const save = () => savedStates.push(campaign.recipients.map(r => r.state));
  return { campaign, events, records, client, save, savedStates };
}

test('campaign snapshots exact content, schedules privately and skips newly suppressed accounts', async () => {
  const f = fixture();
  await scheduleCampaign(f.campaign, f.client, f.save, new Set(['one']));
  assert.deepEqual(f.events, ['draft:one@example.com', 'schedule:email:one@example.com']);
  assert.ok(f.savedStates.some(states => states[0] === 'scheduling'));
  assert.deepEqual(await verifyCampaign(f.campaign, f.client), { sendAt: f.campaign.sendAt, scheduled: 1, remaining: 0, skipped: 1 });
  await scheduleCampaign(f.campaign, f.client, f.save, new Set(['one', 'two']));
  assert.equal(f.events.length, 2, 'repeating the command must not send duplicates or revive skipped users');
});

test('content or audience edits fail before creating any draft', async () => {
  for (const mutate of [(c: Campaign) => { c.subject = 'changed'; }, (c: Campaign) => { c.recipients[0].email = 'other@example.com'; }, (c: Campaign) => { c.recipients[0].text = 'changed'; }]) {
    const f = fixture();
    mutate(f.campaign);
    await assert.rejects(scheduleCampaign(f.campaign, f.client, f.save, new Set(['one', 'two'])), /changed/);
    assert.equal(f.events.length, 0);
  }
});

test('a schedule in the past never becomes an immediate send', async () => {
  const f = fixture();
  f.campaign.sendAt = '2020-01-01T00:00:00Z';
  f.campaign.fingerprint = fingerprint(f.campaign);
  await assert.rejects(scheduleCampaign(f.campaign, f.client, f.save, new Set(['one'])), /no longer in the future/);
  assert.equal(f.events.length, 0);
});

test('an uncertain submission is recovered by provider ID, never resubmitted', async () => {
  const f = fixture();
  const first = f.campaign.recipients[0];
  first.state = 'scheduling'; first.emailId = 'existing-email';
  f.records.push({ id: 'existing-submission', emailId: first.emailId, sendAt: f.campaign.sendAt, undoStatus: 'pending' });
  await scheduleCampaign(f.campaign, f.client, f.save, new Set(['one']));
  assert.deepEqual(f.events, ['inspect:existing-email']);
  assert.equal(first.submissionId, 'existing-submission');
  assert.equal(first.state, 'scheduled');
});

test('an unknown prior submission stops instead of risking a duplicate', async () => {
  const f = fixture();
  f.campaign.recipients[0].state = 'scheduling';
  f.campaign.recipients[0].emailId = 'uncertain-email';
  await assert.rejects(scheduleCampaign(f.campaign, f.client, f.save, new Set(['one'])), /Uncertain submission/);
  assert.deepEqual(f.events, ['inspect:uncertain-email']);
});

test('verification requires the exact provider schedule and pending state', async () => {
  const f = fixture();
  await scheduleCampaign(f.campaign, f.client, f.save, new Set(['one']));
  f.records[0].sendAt = new Date(Date.now()).toISOString();
  await assert.rejects(verifyCampaign(f.campaign, f.client), /Unverified schedule/);
  f.records[0].sendAt = f.campaign.sendAt;
  f.records[0].undoStatus = 'final';
  await assert.rejects(verifyCampaign(f.campaign, f.client), /Unverified schedule/);
});


test('all user audience respects opt outs, internal accounts, placeholders and duplicate emails', async () => {
  const db = d1();
  for (const [id, email, optOut] of [
    ['internal', 'Nick@example.com', 0], ['placeholder', 'user@oauth.invalid', 0],
    ['optedout', 'optedout@example.com', 1], ['blogoptout', 'blog@example.com', 0],
    ['duplicate', ' ALICE@example.com ', 0], ['newuser', 'new@example.com', 0],
  ] as const) {
    await db.prepare('INSERT INTO accounts (id, email, email_opt_out, created_at) VALUES (?, ?, ?, 1)').bind(id, email, optOut).run();
  }
  await db.prepare("INSERT INTO subscribers (id, email, status, token, created_at) VALUES ('sub', 'BLOG@example.com', 'unsubscribed', 'token', 0)").run();
  const audience = await eligibleRecipients(db, ['nick@example.com']);
  assert.deepEqual(audience.map(row => row.email).sort(), ['alice@example.com', 'bob@example.com', 'new@example.com']);
});
