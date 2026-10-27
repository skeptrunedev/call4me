import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fastmail, messageHtml, parseMessage, statusAfterDraft } from '../scripts/outreach-mail.mjs';

const MAIL = 'urn:ietf:params:jmap:mail';
const SUBMISSION = 'urn:ietf:params:jmap:submission';
const session = {
  apiUrl: 'https://discovered.example/jmap/api/',
  primaryAccounts: { [MAIL]: 'account' },
  capabilities: { [MAIL]: {}, [SUBMISSION]: {} },
  accounts: { account: { accountCapabilities: { [MAIL]: {}, [SUBMISSION]: {} } } },
};
const methodResult = (name: string, data: object) => ({ methodResponses: [[name, { accountId: 'account', ...data }, 'outreach']] });
const defaults: Record<string, unknown> = {
  'Identity/get': methodResult('Identity/get', { list: [{ id: 'wrong', email: 'other@example.com' }, { id: 'sender', email: 'me@skeptrune.com' }] }),
  'Mailbox/get': methodResult('Mailbox/get', { list: [{ id: 'drafts', role: 'drafts' }, { id: 'sent', role: 'sent' }] }),
  'Email/get': methodResult('Email/get', { list: [{ id: 'incoming', threadId: 'thread', from: [{ email: 'creator@example.com' }], subject: 'Re: hello', messageId: ['parent@example.com'] }] }),
  'Email/set': methodResult('Email/set', { created: { draft: { id: 'draft-email', threadId: 'thread' } } }),
  'EmailSubmission/set': { methodResponses: [
    ['Email/set', { accountId: 'account', updated: { 'draft-email': null } }, 'outreach'],
    ['EmailSubmission/set', { accountId: 'account', created: { submission: { id: 'submission' } } }, 'outreach'],
  ] },
};
const message = { to: 'creator@example.com', subject: 'hello', text: 'hi <creator> & team\nnext line\n\nnick' };

test('email links stay clickable while HTML and unsafe links remain escaped text', () => {
  assert.equal(messageHtml('[read <this>](https://example.com/?a=1&b=2)'), '<p><a href="https://example.com/?a=1&amp;b=2">read &lt;this&gt;</a></p>');
  assert.equal(messageHtml('[bad](javascript:alert(1))'), '<p>[bad](javascript:alert(1))</p>');
  assert.equal(messageHtml('<script>bad()</script>'), '<p>&lt;script&gt;bad()&lt;/script&gt;</p>');
  assert.equal(messageHtml('[quote](https://example.com/"onclick="bad)'), '<p><a href="https://example.com/&quot;onclick=&quot;bad">quote</a></p>');
});

test('mail-send previews the exact launch file without credentials or network writes', () => {
  const result = JSON.parse(execFileSync(process.execPath, ['scripts/outreach.mjs', 'mail-send', 'me@skeptrune.com', 'docs/product-hunt/launch-email.md', '--dry-run'], { encoding: 'utf8', env: { ...process.env, FASTMAIL_JMAP_TOKEN: '' } }));
  assert.equal(result.to, 'me@skeptrune.com');
  assert.equal(result.subject, 'Call4me is live on Product Hunt!');
  assert.ok(result.html.includes('href="https://call4.me/blog/everything-we-have-improved-since-launch"'));
  assert.ok(!result.text.startsWith('Subject:'));
});

function mock(overrides: Record<string, unknown> = {}, sessionData: unknown = session) {
  const calls: { url: string; body?: any }[] = [];
  const fetchImpl = async (url: string, options: any) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body });
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    const configured = body ? { ...defaults, ...overrides }[body.methodCalls[0][0]] : sessionData;
    const result = Array.isArray(configured) ? configured.shift() : configured;
    return { ok: true, json: async () => result };
  };
  return { client: fastmail({ token: 'test-token', fetchImpl }), calls };
}

test('draft discovery uses the session API and exact sender, without submitting mail', async () => {
  const { client, calls } = mock();
  assert.deepEqual(await client.createDraft(message), { provider: 'fastmail', id: 'draft-email' });
  assert.equal(calls[0].url, 'https://api.fastmail.com/jmap/session');
  assert.ok(calls.slice(1).every((call) => call.url === session.apiUrl));
  assert.deepEqual(calls.slice(1).map((call) => call.body.methodCalls[0][0]), ['Identity/get', 'Mailbox/get', 'Email/set']);
  const draft = calls.at(-1)!.body.methodCalls[0][1].create.draft;
  assert.deepEqual(draft.from, [{ name: 'Nick Khami', email: 'me@skeptrune.com' }]);
  assert.deepEqual(draft.mailboxIds, { drafts: true });
  assert.deepEqual(draft.keywords, { $draft: true });
  assert.equal(draft.bodyValues.html.value, '<p>hi &lt;creator&gt; &amp; team<br>next line</p>\n<p>nick</p>');
  assert.equal(messageHtml('"quoted"'), '<p>&quot;quoted&quot;</p>');
});

test('mail status is read only and reuses discovery', async () => {
  const { client, calls } = mock();
  const status = await client.status();
  assert.equal(status.sender.email, 'me@skeptrune.com');
  await client.status();
  assert.equal(calls.length, 3);
  assert.ok(calls.slice(1).every((call) => call.body.methodCalls[0][0].endsWith('/get')));
});

test('mail search and full body reads preserve mailbox and read state', async () => {
  const email = { id: 'reply', subject: 'Re: hello', bodyValues: { text: { value: 'interested' } } };
  const { client, calls } = mock({
    'Email/query': methodResult('Email/query', { ids: ['reply'], position: 100, total: 101 }),
    'Email/get': methodResult('Email/get', { list: [email], notFound: [] }),
  });
  const filter = { after: '2026-10-01T00:00:00Z', text: 'call4me' };
  assert.equal((await client.search({ filter, position: 100, limit: 10 })).total, 101);
  assert.deepEqual(calls.at(-1)!.body.methodCalls[0][1], { accountId: 'account', filter, position: 100, limit: 10, sort: [{ property: 'receivedAt', isAscending: false }], calculateTotal: true });
  assert.deepEqual((await client.read(['reply'])).list, [email]);
  const read = calls.at(-1)!.body.methodCalls[0][1];
  assert.equal(read.fetchTextBodyValues, true);
  assert.equal(read.fetchHTMLBodyValues, true);
  assert.ok(read.properties.includes('keywords'));
  assert.ok(calls.slice(1).every((call) => !call.body.methodCalls[0][0].endsWith('/set')));
  await assert.rejects(client.search({ position: -1 }), /position/);
  await assert.rejects(client.read([]), /email ids/);
});

test('replies preserve references and reject recipient or thread mismatches before submitting', async () => {
  const source = { id: 'incoming', threadId: 'thread', from: [{ email: message.to }], subject: 'Re: hello', messageId: ['parent@example.com'], references: ['root@example.com'] };
  const overrides = {
    'Email/get': methodResult('Email/get', { list: [source] }),
    'Email/set': methodResult('Email/set', { created: { draft: { id: 'draft-email', threadId: 'thread' } } }),
  };
  const { client, calls } = mock(overrides);
  assert.equal((await client.reply({ id: 'incoming', to: message.to, text: message.text })).submissionId, 'submission');
  const draft = calls.find((call) => call.body?.methodCalls[0][0] === 'Email/set')!.body.methodCalls[0][1].create.draft;
  assert.equal(draft.subject, 'Re: hello');
  assert.deepEqual(draft.inReplyTo, ['parent@example.com']);
  assert.deepEqual(draft.references, ['root@example.com', 'parent@example.com']);
  const wrongRecipient = mock(overrides);
  await assert.rejects(wrongRecipient.client.reply({ id: 'incoming', to: 'wrong@example.com', text: 'hello' }), /intended recipient/);
  assert.ok(wrongRecipient.calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  const wrongThread = mock({ ...overrides, 'Email/set': methodResult('Email/set', { created: { draft: { id: 'unsent-draft', threadId: 'wrong-thread' } } }) });
  await assert.rejects(wrongThread.client.reply({ id: 'incoming', to: message.to, text: 'hello' }), /inspect before sending/);
  assert.ok(wrongThread.calls.every((call) => call.body?.methodCalls[0][0] !== 'EmailSubmission/set'));
});

test('follow-ups to sent mail from an authenticated alias preserve recipient and thread', async () => {
  const source = { id: 'outgoing', threadId: 'thread', from: [{ email: 'me@call4.me' }], to: [{ email: message.to }], mailboxIds: { sent: true }, keywords: {}, subject: 'hello', messageId: ['parent@example.com'], references: ['root@example.com'] };
  const identities = methodResult('Identity/get', { list: [{ id: 'sender', email: 'me@skeptrune.com' }, { id: 'alias', email: 'me@call4.me' }] });
  const setup = (changes: object = {}) => mock({ 'Identity/get': identities, 'Email/get': methodResult('Email/get', { list: [{ ...source, ...changes }] }) });
  const { client, calls } = setup();
  assert.equal((await client.reply({ id: source.id, to: message.to, text: message.text })).submissionId, 'submission');
  const draft = calls.find((call) => call.body?.methodCalls[0][0] === 'Email/set')!.body.methodCalls[0][1].create.draft;
  assert.deepEqual(draft.to, [{ email: message.to }]);
  assert.equal(draft.subject, 'Re: hello');
  assert.deepEqual(draft.inReplyTo, source.messageId);
  assert.deepEqual(draft.references, ['root@example.com', 'parent@example.com']);
  for (const changes of [
    { to: [{ email: 'wrong@example.com' }] },
    { to: [{ email: message.to }, { email: 'other@example.com' }] },
    { mailboxIds: { inbox: true } },
    { keywords: { $draft: true } },
    { cc: [{ email: 'other@example.com' }] },
    { bcc: [{ email: 'other@example.com' }] },
    { from: [{ email: 'unknown@example.com' }] },
  ]) {
    const rejected = setup(changes);
    await assert.rejects(rejected.client.reply({ id: source.id, to: message.to, text: message.text }), /intended recipient|sent email/);
    assert.ok(rejected.calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }
});

test('only explicit send submits and moves the created draft to sent', async () => {
  const { client, calls } = mock();
  assert.deepEqual(await client.send(message), { provider: 'fastmail', id: 'draft-email', submissionId: 'submission' });
  const submission = calls.at(-1)!.body.methodCalls[0][1];
  assert.deepEqual(submission.create.submission, { identityId: 'sender', emailId: 'draft-email' });
  assert.deepEqual(submission.onSuccessUpdateEmail, { '#submission': {
    'mailboxIds/drafts': null, 'mailboxIds/sent': true, 'keywords/$draft': null,
  } });
});

test('authentication, missing sender and wrong account stop before writes', async () => {
  const auth = fastmail({ token: 'test-token', fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(auth.createDraft(message), /HTTP 401/);
  const missing = mock({ 'Identity/get': methodResult('Identity/get', { list: [{ id: 'wrong', email: 'other@example.com' }] }) });
  await assert.rejects(missing.client.createDraft(message), /no sender identity/);
  assert.equal(missing.calls.length, 2);
  const account = mock({}, { ...session, primaryAccounts: {} });
  await assert.rejects(account.client.createDraft(message), /no primary mail account/);
  assert.equal(account.calls.length, 1);
  const mismatch = mock({ 'Identity/get': { methodResponses: [['Identity/get', { accountId: 'other', list: [] }, 'outreach']] } });
  await assert.rejects(mismatch.client.createDraft(message), /different account/);
  assert.equal(mismatch.calls.length, 2);
});

test('provider notCreated and method errors do not retry or claim success', async () => {
  const draft = mock({ 'Email/set': methodResult('Email/set', { notCreated: { draft: { type: 'forbidden' } } }) });
  await assert.rejects(draft.client.createDraft(message), /draft creation failed: forbidden/);
  assert.equal(draft.calls.length, 4);
  const submission = mock({ 'EmailSubmission/set': methodResult('EmailSubmission/set', { notCreated: { submission: { type: 'forbiddenToSend' } } }) });
  await assert.rejects(submission.client.send(message), /draft draft-email; inspect that draft before retrying: forbiddenToSend/);
  assert.equal(submission.calls.length, 5);
  const methodError = mock({ 'Email/set': { methodResponses: [['error', { type: 'serverFail' }, 'outreach']] } });
  await assert.rejects(methodError.client.createDraft(message), /Email\/set failed: serverFail/);
  assert.equal(methodError.calls.length, 4);
});

test('successful submission with a filing error stays successful to prevent a duplicate send', async () => {
  const { client, calls } = mock({ 'EmailSubmission/set': { methodResponses: [
    ['error', { type: 'serverFail' }, 'outreach'],
    ['EmailSubmission/set', { accountId: 'account', created: { submission: { id: 'submission' } } }, 'outreach'],
  ] } });
  const delivered = await client.send(message);
  assert.equal(delivered.submissionId, 'submission');
  assert.match(delivered.warning, /mail submitted, but Sent mailbox update was not confirmed \(serverFail\)/);
  assert.equal(calls.length, 5);
});

test('drafting preserves prior contact history statuses', () => {
  for (const status of ['new', 'drafted', 'no_contact']) assert.equal(statusAfterDraft(status), 'drafted');
  for (const status of ['sent', 'replied', 'won', 'declined']) assert.equal(statusAfterDraft(status), status);
});

const originalDraft = {
  id: 'original-draft', mailboxIds: { drafts: true }, keywords: { $draft: true },
  subject: message.subject,
  from: [{ email: 'me@skeptrune.com' }], to: [{ email: message.to }],
  sender: null, cc: null, bcc: null, replyTo: null, inReplyTo: null, references: null,
  hasAttachment: false, attachments: [], htmlBody: [{ partId: 'html', type: 'text/html' }],
  bodyValues: { html: { value: messageHtml(message.text), isTruncated: false } },
};
const replacementMessage = { ...message, id: originalDraft.id, expectedText: message.text, text: 'updated body\n\nnick' };
const replacementResponses = () => [
  methodResult('Email/set', { created: { draft: { id: 'replacement-draft' } }, newState: 'after-create' }),
  methodResult('Email/set', { destroyed: [originalDraft.id], newState: 'after-destroy' }),
];
const replacementOverrides = (original: object = originalDraft) => ({
  'Email/get': methodResult('Email/get', { state: 'before-create', list: [original] }),
  'Email/set': replacementResponses(),
});

const sendDraftMessage = { ...message, id: originalDraft.id };
const draftSubmissionResponse = {
  methodResponses: [
    ['Email/set', { accountId: 'account', updated: { 'original-draft': null } }, 'outreach'],
    ['EmailSubmission/set', { accountId: 'account', created: { submission: { id: 'submission' } } }, 'outreach'],
  ],
};
const sendDraftOverrides = (original: object = originalDraft) => ({
  'Email/get': methodResult('Email/get', { state: 'original-state', list: [original] }),
  'EmailSubmission/set': draftSubmissionResponse,
});

const sendAt = new Date(Math.floor(Date.now() / 1000 + 3600) * 1000).toISOString().replace('.000Z', 'Z');
const scheduled = { id: 'submission', emailId: originalDraft.id, sendAt, undoStatus: 'pending' };
const scheduleSession = { ...session, accounts: { account: { accountCapabilities: { [MAIL]: {}, [SUBMISSION]: { maxDelayedSend: 86400 } } } } };
const scheduleOverrides = () => ({
  ...sendDraftOverrides(),
  'EmailSubmission/query': methodResult('EmailSubmission/query', { ids: [], total: 0 }),
  'EmailSubmission/get': methodResult('EmailSubmission/get', { list: [scheduled], notFound: [] }),
});
const scheduleMessage = { ...sendDraftMessage, sendAt };

test('message parsing requires a subject and body and handles CRLF', () => {
  assert.deepEqual(parseMessage('Subject: hello\r\n\r\nbody\r\n'), { subject: 'hello', text: 'body' });
  for (const value of ['', 'Subject: hello\nbody', 'Subject: \n\nbody', 'Subject: hello\n\n ', 'Subject: hi\rBcc: surprise\n\nbody']) assert.throws(() => parseMessage(value), /Subject/);
});

test('native scheduling uses HOLDUNTIL, verifies provider state and files the existing message', async () => {
  const { client, calls } = mock(scheduleOverrides(), scheduleSession);
  assert.equal((await client.status()).maxDelayedSend, 86400);
  assert.deepEqual(await client.scheduleDraft(scheduleMessage), { provider: 'fastmail', id: originalDraft.id, submissionId: 'submission', sendAt, undoStatus: 'pending' });
  const writes = calls.filter((call) => call.body?.methodCalls[0][0].endsWith('/set'));
  assert.equal(writes.length, 1);
  const args = writes[0].body.methodCalls[0][1];
  assert.deepEqual(args.create.submission, {
    identityId: 'sender', emailId: originalDraft.id,
    envelope: { mailFrom: { email: 'me@skeptrune.com', parameters: { HOLDUNTIL: sendAt } }, rcptTo: [{ email: message.to }] },
  });
  assert.deepEqual(args.onSuccessUpdateEmail, { '#submission': { 'mailboxIds/drafts': null, 'mailboxIds/sent': true, 'keywords/$draft': null } });
  assert.deepEqual(calls.at(-1)!.body.methodCalls[0][1].ids, ['submission']);
});

test('scheduling rejects invalid dates, expired times and unsupported or excessive delays before writes', async () => {
  for (const date of ['nonsense', '2026-02-30T15:15:00Z', '2000-01-01T00:00:00Z', '2026-10-08T08:15:00-07:00', new Date(Date.now() + 172800000).toISOString().replace(/\.\d{3}Z$/, 'Z')]) {
    const { client, calls } = mock(scheduleOverrides(), scheduleSession);
    await assert.rejects(client.scheduleDraft({ ...scheduleMessage, sendAt: date }), /Scheduled time/);
    assert.ok(calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }
  const unsupported = mock(scheduleOverrides());
  await assert.rejects(unsupported.client.scheduleDraft(scheduleMessage), /delayed send window/);
  assert.ok(unsupported.calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
});

test('scheduling refuses active or uncertain previous submissions and altered drafts before writing', async () => {
  for (const undoStatus of ['pending', 'final', undefined]) {
    const { client, calls } = mock({ ...scheduleOverrides(),
      'EmailSubmission/query': methodResult('EmailSubmission/query', { ids: ['submission'], total: 1 }),
      'EmailSubmission/get': methodResult('EmailSubmission/get', { list: [{ ...scheduled, undoStatus }], notFound: [] }),
    }, scheduleSession);
    await assert.rejects(client.scheduleDraft(scheduleMessage), /already has an active submission/);
    assert.ok(calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }
  for (const overrides of [
    { 'EmailSubmission/query': methodResult('EmailSubmission/query', { ids: [], total: 1 }) },
    { 'Email/get': methodResult('Email/get', { state: 'state', list: [{ ...originalDraft, subject: 'changed' }] }) },
  ]) {
    const { client, calls } = mock({ ...scheduleOverrides(), ...overrides }, scheduleSession);
    await assert.rejects(client.scheduleDraft(scheduleMessage));
    assert.ok(calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }
});

test('provider schedule mismatches preserve the native id and never retry or fall back to immediate send', async () => {
  for (const providerState of [
    { ...scheduled, sendAt: '2000-01-01T00:00:00Z' },
    { ...scheduled, undoStatus: 'final' },
    { ...scheduled, emailId: 'wrong' },
    null,
  ]) {
    const { client, calls } = mock({ ...scheduleOverrides(), 'EmailSubmission/get': methodResult('EmailSubmission/get', { list: providerState ? [providerState] : [], notFound: providerState ? [] : ['submission'] }) }, scheduleSession);
    await assert.rejects(client.scheduleDraft(scheduleMessage), (error: any) => {
      assert.equal(error.submissionId, 'submission');
      assert.equal(error.emailId, originalDraft.id);
      assert.match(error.message, /inspect provider submissions before retrying/);
      return true;
    });
    assert.equal(calls.filter((call) => call.body?.methodCalls[0][0].endsWith('/set')).length, 1);
  }
});

test('native schedule rejection never attempts immediate delivery and filing failures remain verified schedules', async () => {
  const failed = mock({ ...scheduleOverrides(), 'EmailSubmission/set': methodResult('EmailSubmission/set', { notCreated: { submission: { type: 'invalidProperties' } } }) }, scheduleSession);
  await assert.rejects(failed.client.scheduleDraft(scheduleMessage), /invalidProperties/);
  assert.equal(failed.calls.filter((call) => call.body?.methodCalls[0][0].endsWith('/set')).length, 1);
  const filing = mock({ ...scheduleOverrides(), 'EmailSubmission/set': methodResult('EmailSubmission/set', { created: { submission: { id: 'submission' } } }) }, scheduleSession);
  const result = await filing.client.scheduleDraft(scheduleMessage);
  assert.equal(result.submissionId, 'submission');
  assert.equal(result.sendAt, sendAt);
  assert.match(result.warning!, /mail scheduled.*Sent mailbox update/);
});

test('cancellation updates undoStatus and confirms canceled status without deleting anything', async () => {
  const { client, calls } = mock({
    'EmailSubmission/set': methodResult('EmailSubmission/set', { updated: { submission: null } }),
    'EmailSubmission/get': methodResult('EmailSubmission/get', { list: [{ ...scheduled, undoStatus: 'canceled' }] }),
  });
  assert.equal((await client.cancelSubmission('submission')).undoStatus, 'canceled');
  const write = calls.find((call) => call.body?.methodCalls[0][0] === 'EmailSubmission/set')!.body.methodCalls[0][1];
  assert.deepEqual(write, { accountId: 'account', update: { submission: { undoStatus: 'canceled' } } });
  const failed = mock({ 'EmailSubmission/set': methodResult('EmailSubmission/set', { notUpdated: { submission: { type: 'cannotUnsend' } } }) });
  await assert.rejects(failed.client.cancelSubmission('submission'), /cannotUnsend/);
  assert.equal(failed.calls.filter((call) => call.body?.methodCalls[0][0].endsWith('/set')).length, 1);
});

test('sending an existing draft submits its verified native id without creating another email', async () => {
  const { client, calls } = mock(sendDraftOverrides());
  assert.deepEqual(await client.sendDraft(sendDraftMessage), { provider: 'fastmail', id: 'original-draft', submissionId: 'submission' });
  assert.deepEqual(calls.slice(1).map((call) => call.body.methodCalls[0][0]), ['Identity/get', 'Mailbox/get', 'Email/get', 'EmailSubmission/set']);
  const read = calls[3].body.methodCalls[0][1];
  assert.deepEqual(read.ids, ['original-draft']);
  assert.ok(read.properties.includes('subject'));
  const submission = calls[4].body.methodCalls[0][1];
  assert.deepEqual(submission.create.submission, { identityId: 'sender', emailId: 'original-draft' });
  assert.deepEqual(submission.onSuccessUpdateEmail, { '#submission': {
    'mailboxIds/drafts': null, 'mailboxIds/sent': true, 'keywords/$draft': null,
  } });
  assert.ok(calls.every((call) => call.body?.methodCalls[0][0] !== 'Email/set'));
});

test('existing draft submission refuses sent mail, mismatched content or extra recipients before submitting', async () => {
  const invalid = [
    { ...originalDraft, keywords: {} },
    { ...originalDraft, mailboxIds: { sent: true } },
    { ...originalDraft, mailboxIds: { drafts: true, sent: true } },
    { ...originalDraft, from: [{ email: 'wrong@example.com' }] },
    { ...originalDraft, to: [{ email: 'wrong@example.com' }] },
    { ...originalDraft, to: [...originalDraft.to, { email: 'second@example.com' }] },
    { ...originalDraft, subject: 'edited subject' },
    { ...originalDraft, bodyValues: { html: { value: '<p>edited body</p>' } } },
    { ...originalDraft, hasAttachment: true },
    ...['sender', 'cc', 'bcc', 'replyTo', 'inReplyTo', 'references', 'attachments'].map((property) => ({ ...originalDraft, [property]: ['extra'] })),
  ];
  for (const original of invalid) {
    const { client, calls } = mock(sendDraftOverrides(original));
    await assert.rejects(client.sendDraft(sendDraftMessage));
    assert.ok(calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }
});

test('existing draft submission failure is not retried and a filing error retains confirmed submission', async () => {
  const failed = mock({ ...sendDraftOverrides(), 'EmailSubmission/set': methodResult('EmailSubmission/set', { notCreated: { submission: { type: 'forbiddenToSend' } } }) });
  await assert.rejects(failed.client.sendDraft(sendDraftMessage), /original-draft.*inspect.*retrying.*forbiddenToSend/);
  assert.equal(failed.calls.filter((call) => call.body?.methodCalls[0][0] === 'EmailSubmission/set').length, 1);
  assert.ok(failed.calls.every((call) => call.body?.methodCalls[0][0] !== 'Email/set'));
  const filing = mock({ ...sendDraftOverrides(), 'EmailSubmission/set': { methodResponses: [
    ['Email/set', { accountId: 'account', notUpdated: { 'original-draft': { type: 'forbidden' } } }, 'outreach'],
    ['EmailSubmission/set', { accountId: 'account', created: { submission: { id: 'submission' } } }, 'outreach'],
  ] } });
  const sent = await filing.client.sendDraft(sendDraftMessage);
  assert.equal(sent.id, 'original-draft');
  assert.equal(sent.submissionId, 'submission');
  assert.match(sent.warning, /mail submitted.*Sent mailbox update.*forbidden/);
  assert.equal(filing.calls.filter((call) => call.body?.methodCalls[0][0] === 'EmailSubmission/set').length, 1);
});

const replySource = { id: 'incoming', threadId: 'thread', from: [{ email: message.to }], subject: 'Re: hello', messageId: ['parent@example.com'], references: ['root@example.com'] };
const replyDraft = { ...originalDraft, subject: replySource.subject, threadId: 'thread', inReplyTo: replySource.messageId, references: ['root@example.com', 'parent@example.com'] };
const sendReplyDraftMessage = { id: replySource.id, draftId: originalDraft.id, to: message.to, text: message.text };
const replyDraftReads = (draft: object = replyDraft) => [
  methodResult('Email/get', { list: [replySource] }),
  methodResult('Email/get', { state: 'draft-state', list: [draft] }),
];

test('existing reply draft sends its native id after validating its source and thread', async () => {
  const { client, calls } = mock({ 'Email/get': replyDraftReads(), 'EmailSubmission/set': draftSubmissionResponse });
  assert.equal((await client.sendReplyDraft(sendReplyDraftMessage)).submissionId, 'submission');
  assert.deepEqual(calls.at(-1)!.body.methodCalls[0][1].create.submission, { identityId: 'sender', emailId: originalDraft.id });
  assert.ok(calls.every((call) => call.body?.methodCalls[0][0] !== 'Email/set'));
  assert.equal(calls.filter((call) => call.body?.methodCalls[0][0] === 'EmailSubmission/set').length, 1);
});

test('reply draft sending rejects changed content, recipients, thread and parent headers before writes', async () => {
  const invalid = [
    { ...replyDraft, threadId: 'wrong-thread' },
    { ...replyDraft, inReplyTo: ['wrong-parent@example.com'] },
    { ...replyDraft, references: ['unexpected@example.com'] },
    { ...replyDraft, inReplyTo: null },
    { ...replyDraft, subject: 'changed subject' },
    { ...replyDraft, keywords: {} },
    { ...replyDraft, to: [{ email: 'wrong@example.com' }] },
    { ...replyDraft, cc: [{ email: 'extra@example.com' }] },
    { ...replyDraft, bodyValues: { html: { value: '<p>changed</p>' } } },
  ];
  for (const draft of invalid) {
    const { client, calls } = mock({ 'Email/get': replyDraftReads(draft) });
    await assert.rejects(client.sendReplyDraft(sendReplyDraftMessage));
    assert.ok(calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }
  const wrongSource = mock({ 'Email/get': replyDraftReads() });
  await assert.rejects(wrongSource.client.sendReplyDraft({ ...sendReplyDraftMessage, to: 'wrong@example.com' }), /intended recipient/);
  assert.ok(wrongSource.calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
});

test('draft replacement verifies the original and guards both native mutations without submitting', async () => {
  const { client, calls } = mock(replacementOverrides());
  assert.deepEqual(await client.replaceDraft(replacementMessage), { provider: 'fastmail', id: 'replacement-draft', previousId: 'original-draft', replaced: true });
  const methods = calls.slice(1).map((call) => call.body.methodCalls[0][0]);
  assert.deepEqual(methods, ['Identity/get', 'Mailbox/get', 'Email/get', 'Email/set', 'Email/set']);
  const read = calls[3].body.methodCalls[0][1];
  assert.deepEqual(read.ids, ['original-draft']);
  assert.equal(read.fetchHTMLBodyValues, true);
  const create = calls[4].body.methodCalls[0][1];
  assert.equal(create.ifInState, 'before-create');
  assert.deepEqual(create.create.draft.mailboxIds, { drafts: true });
  assert.deepEqual(create.create.draft.keywords, { $draft: true });
  assert.deepEqual(create.create.draft.from, [{ name: 'Nick Khami', email: 'me@skeptrune.com' }]);
  assert.deepEqual(create.create.draft.to, [{ email: message.to }]);
  assert.equal(create.create.draft.bodyValues.html.value, messageHtml(replacementMessage.text));
  assert.equal(create.destroy, undefined);
  assert.deepEqual(calls[5].body.methodCalls[0][1], { accountId: 'account', ifInState: 'after-create', destroy: ['original-draft'] });
});

test('edited, sent or mismatched original drafts stop before any writes', async () => {
  const invalid = [
    { ...originalDraft, keywords: {} },
    { ...originalDraft, mailboxIds: { sent: true } },
    { ...originalDraft, mailboxIds: { drafts: true, sent: true } },
    { ...originalDraft, from: [{ email: 'wrong@example.com' }] },
    { ...originalDraft, sender: [{ email: 'wrong@example.com' }] },
    { ...originalDraft, to: [{ email: 'wrong@example.com' }] },
    { ...originalDraft, to: [...originalDraft.to, { email: 'second@example.com' }] },
    ...['cc', 'bcc', 'replyTo', 'inReplyTo', 'references', 'attachments'].map((property) => ({ ...originalDraft, [property]: ['extra'] })),
    { ...originalDraft, hasAttachment: true },
    { ...originalDraft, bodyValues: { html: { value: '<p>edited in Fastmail</p>' } } },
    { ...originalDraft, bodyValues: { html: { value: messageHtml(message.text), isTruncated: true } } },
    { ...originalDraft, htmlBody: [] },
  ];
  for (const original of invalid) {
    const { client, calls } = mock(replacementOverrides(original));
    await assert.rejects(client.replaceDraft(replacementMessage), /Original/);
    assert.ok(calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }
  for (const response of [{ state: 'before-create', list: [], notFound: [originalDraft.id] }, { list: [originalDraft] }]) {
    const { client, calls } = mock({ ...replacementOverrides(), 'Email/get': methodResult('Email/get', response) });
    await assert.rejects(client.replaceDraft(replacementMessage), /Original/);
    assert.ok(calls.every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }
});

test('replacement creation failure and concurrent edits preserve the original without retrying', async () => {
  for (const response of [
    methodResult('Email/set', { notCreated: { draft: { type: 'forbidden' } } }),
    { methodResponses: [['error', { type: 'stateMismatch' }, 'outreach']] },
  ]) {
    const { client, calls } = mock({ ...replacementOverrides(), 'Email/set': response });
    await assert.rejects(client.replaceDraft(replacementMessage), /forbidden|stateMismatch/);
    const writes = calls.filter((call) => call.body?.methodCalls[0][0].endsWith('/set'));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.methodCalls[0][1].destroy, undefined);
  }
});

test('partial replacement returns the created draft id and inspection warning without retries', async () => {
  for (const response of [
    methodResult('Email/set', { notDestroyed: { [originalDraft.id]: { type: 'forbidden' } } }),
    { methodResponses: [['error', { type: 'stateMismatch' }, 'outreach']] },
  ]) {
    const responses = replacementResponses();
    responses[1] = response;
    const { client, calls } = mock({ ...replacementOverrides(), 'Email/set': responses });
    const result = await client.replaceDraft(replacementMessage);
    assert.equal(result.id, 'replacement-draft');
    assert.equal(result.replaced, false);
    assert.match(result.warning, /inspect both drafts before retrying to avoid duplicates/);
    assert.equal(calls.length, 6);
    assert.ok(calls.every((call) => call.body?.methodCalls[0][0] !== 'EmailSubmission/set'));
  }
  const { client, calls } = mock({ ...replacementOverrides(), 'Email/set': methodResult('Email/set', { created: { draft: { id: 'replacement-draft' } } }) });
  assert.match((await client.replaceDraft(replacementMessage)).warning, /no email state/);
  assert.equal(calls.length, 5);
});

// Stub only external boundaries so the actual CLI routing and SQL are exercised.
function cliFixture(row: Record<string, unknown>, run: (fixture: { run: (args: string[]) => string; calls: () => any[] }) => void, overrides: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'outreach-mail-test-'));
  const log = join(directory, 'calls.jsonl');
  const preload = join(directory, 'fetch.mjs');
  writeFileSync(join(directory, 'npx'), `#!${process.execPath}\nimport {appendFileSync} from 'node:fs';\nappendFileSync(${JSON.stringify(log)},JSON.stringify({sql:process.argv.at(-1)})+'\\n');\nconsole.log(JSON.stringify([{results:[${JSON.stringify(row)}]}]));\n`, { mode: 0o755 });
  writeFileSync(preload, `import {appendFileSync} from 'node:fs';\nconst responses=${JSON.stringify({ ...defaults, ...overrides })};\nglobalThis.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;appendFileSync(${JSON.stringify(log)},JSON.stringify({url,body})+'\\n');const result=body?responses[body.methodCalls[0][0]]:${JSON.stringify(session)};return{ok:true,json:async()=>Array.isArray(result)?result.shift():result}};\n`);
  try {
    run({
      run: (args) => execFileSync(process.execPath, ['--import', preload, 'scripts/outreach.mjs', ...args], {
        encoding: 'utf8', env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, FASTMAIL_JMAP_TOKEN: 'test-token' }, stdio: ['ignore', 'pipe', 'pipe'],
      }),
      calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const row = { id: 'person', name: 'Creator', kind: 'creator', email: message.to, message: message.text, notes: 'existing notes', status: 'new' };

test('both CLI dry runs only read D1, without provider requests or mutations', () => {
  cliFixture(row, (fixture) => {
    for (const command of ['email', 'email-draft']) assert.match(fixture.run([command, 'person', 'hello', '--dry-run']), /to: creator@example.com/);
    assert.equal(fixture.calls().length, 2);
    assert.ok(fixture.calls().every((call) => call.sql.startsWith('SELECT')));
  });
});

test('list JSON preserves structural data and email duplicate guard prevents provider calls', () => {
  cliFixture({ ...row, sent_via: 'email' }, (fixture) => {
    assert.equal(JSON.parse(fixture.run(['list', '--json']))[0].id, 'person');
    assert.throws(() => fixture.run(['email', 'person', 'hello']), /already emailed/);
    assert.ok(fixture.calls().every((call) => call.sql.startsWith('SELECT')));
  });
});

test('CLI draft records native draft id without changing prior sent history', () => {
  cliFixture({ ...row, status: 'sent', sent_via: 'other', sent_at: 123 }, (fixture) => {
    assert.match(fixture.run(['email-draft', 'person', 'hello']), /draft-email/);
    const calls = fixture.calls();
    const update = calls.find((call) => call.sql?.startsWith('UPDATE')).sql;
    assert.match(update, /status = 'sent'/);
    assert.match(update, /existing notes/);
    assert.match(update, /fastmail draft id draft-email/);
    assert.doesNotMatch(update, /sent_via|sent_at|message =/);
    assert.ok(calls.every((call) => !call.body || call.body.methodCalls[0][0] !== 'EmailSubmission/set'));
  });
});

test('CLI existing draft send dry run is read only and successful send records the native id and sent timestamp', () => {
  cliFixture({ ...row, status: 'drafted' }, (fixture) => {
    const args = ['email-send-draft', 'person', 'original-draft', message.subject];
    assert.equal(fixture.run([...args, '--dry-run']), `to: ${message.to}\nsubject: ${message.subject}\n\n${message.text}\n`);
    assert.ok(fixture.calls().every((call) => !call.sql || call.sql.startsWith('SELECT')));
    assert.ok(fixture.calls().every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
    assert.match(fixture.run(args), /original-draft/);
    const calls = fixture.calls();
    const update = calls.find((call) => call.sql?.startsWith('UPDATE')).sql;
    assert.match(update, /status = 'sent'/);
    assert.match(update, /sent_via = 'email'/);
    assert.match(update, /sent_at = \d+/);
    assert.match(update, /existing notes/);
    assert.match(update, /original-draft/);
    assert.match(update, /submission/);
    assert.doesNotMatch(update, /message =/);
    assert.equal(calls.filter((call) => call.body?.methodCalls[0][0] === 'EmailSubmission/set').length, 1);
    assert.ok(calls.every((call) => call.body?.methodCalls[0][0] !== 'Email/set'));
  }, sendDraftOverrides());
});

test('CLI existing draft send refuses already emailed rows before provider access and content mismatches before submit', () => {
  cliFixture({ ...row, status: 'sent', sent_via: 'email', sent_at: 123 }, (fixture) => {
    assert.throws(() => fixture.run(['email-send-draft', 'person', 'original-draft', message.subject]), /already emailed/);
    assert.ok(fixture.calls().every((call) => call.sql?.startsWith('SELECT')));
  }, sendDraftOverrides());
  cliFixture(row, (fixture) => {
    assert.throws(() => fixture.run(['email-send-draft', 'person', 'original-draft', message.subject]), /body.*match/);
    assert.ok(fixture.calls().every((call) => !call.sql || call.sql.startsWith('SELECT')));
    assert.ok(fixture.calls().every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
  }, sendDraftOverrides({ ...originalDraft, bodyValues: { html: { value: '<p>unexpected draft body</p>' } } }));
});

test('CLI existing draft send preserves replied status and records confirmed submission despite a filing warning', () => {
  cliFixture({ ...row, status: 'replied', replied_at: 456 }, (fixture) => {
    assert.match(fixture.run(['email-send-draft', 'person', 'original-draft', message.subject]), /original-draft/);
    const calls = fixture.calls();
    const update = calls.find((call) => call.sql?.startsWith('UPDATE')).sql;
    assert.match(update, /status = 'replied'/);
    assert.match(update, /sent_via = 'email'/);
    assert.match(update, /sent_at = \d+/);
    assert.match(update, /submission/);
    assert.match(update, /Sent mailbox update/);
    assert.doesNotMatch(update, /message =|replied_at/);
    assert.equal(calls.filter((call) => call.body?.methodCalls[0][0] === 'EmailSubmission/set').length, 1);
  }, { ...sendDraftOverrides(), 'EmailSubmission/set': { methodResponses: [
    ['Email/set', { accountId: 'account', notUpdated: { 'original-draft': { type: 'forbidden' } } }, 'outreach'],
    ['EmailSubmission/set', { accountId: 'account', created: { submission: { id: 'submission' } } }, 'outreach'],
  ] } });
});

test('CLI draft update routes the guarded replacement and preserves prior sent history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'outreach-draft-update-test-'));
  const file = join(directory, 'body.txt');
  writeFileSync(file, replacementMessage.text);
  try {
    cliFixture({ ...row, status: 'replied', sent_via: 'email', sent_at: 123, replied_at: 456 }, (fixture) => {
      const args = ['email-draft-update', 'person', 'original-draft', 'updated subject', file];
      assert.match(fixture.run([...args, '--dry-run']), /replace draft: original-draft/);
      assert.ok(fixture.calls().every((call) => call.sql?.startsWith('SELECT')));
      const result = JSON.parse(fixture.run(args));
      assert.equal(result.id, 'replacement-draft');
      assert.equal(result.replaced, true);
      const calls = fixture.calls();
      const update = calls.find((call) => call.sql?.startsWith('UPDATE')).sql;
      assert.match(update, /message = 'updated body\n\nnick'/);
      assert.match(update, /status = 'replied'/);
      assert.match(update, /existing notes/);
      assert.match(update, /replaced fastmail draft original-draft with draft replacement-draft/);
      assert.doesNotMatch(update, /sent_via|sent_at|replied_at/);
      const create = calls.find((call) => call.body?.methodCalls[0][1].create)?.body.methodCalls[0][1].create.draft;
      assert.equal(create.subject, 'updated subject');
      assert.ok(calls.every((call) => call.body?.methodCalls[0][0] !== 'EmailSubmission/set'));
    }, replacementOverrides());
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI draft update leaves tracker unchanged on original mismatch or partial replacement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'outreach-draft-update-failure-test-'));
  const file = join(directory, 'body.txt');
  writeFileSync(file, replacementMessage.text);
  try {
    cliFixture(row, (fixture) => {
      assert.throws(() => fixture.run(['email-draft-update', 'person', 'original-draft', 'hello', file]), /does not match the outreach tracker/);
      assert.ok(fixture.calls().every((call) => !call.sql || call.sql.startsWith('SELECT')));
      assert.ok(fixture.calls().every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
    }, replacementOverrides({ ...originalDraft, bodyValues: { html: { value: '<p>edited</p>' } } }));
    const responses = replacementResponses();
    responses[1] = methodResult('Email/set', { notDestroyed: { 'original-draft': { type: 'forbidden' } } });
    cliFixture(row, (fixture) => {
      assert.throws(() => fixture.run(['email-draft-update', 'person', 'original-draft', 'hello', file]), (error: any) => {
        assert.equal(JSON.parse(error.stdout).id, 'replacement-draft');
        assert.match(error.stderr, /inspect both drafts before retrying to avoid duplicates/);
        return true;
      });
      assert.ok(fixture.calls().every((call) => !call.sql || call.sql.startsWith('SELECT')));
      assert.ok(fixture.calls().every((call) => call.body?.methodCalls[0][0] !== 'EmailSubmission/set'));
    }, { ...replacementOverrides(), 'Email/set': responses });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI reply dry run stays read only and sending preserves original contact history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'outreach-reply-test-'));
  const file = join(directory, 'reply.txt');
  writeFileSync(file, 'thanks, interested');
  try {
    cliFixture({ ...row, status: 'replied', sent_via: 'email', sent_at: 123 }, (fixture) => {
      const preview = JSON.parse(fixture.run(['email-reply', 'person', 'incoming', file, '--dry-run']));
      assert.equal(preview.expectedThreadId, 'thread');
      assert.ok(fixture.calls().every((call) => !call.sql || call.sql.startsWith('SELECT')));
      assert.ok(fixture.calls().every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
      assert.equal(JSON.parse(fixture.run(['email-reply', 'person', 'incoming', file])).submissionId, 'submission');
      const update = fixture.calls().find((call) => call.sql?.startsWith('UPDATE')).sql;
      assert.match(update, /thanks, interested/);
      assert.doesNotMatch(update, /sent_at|sent_via|message =|status =/);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('direct mail reply does not query or modify the outreach tracker', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mail-reply-test-'));
  const file = join(directory, 'reply.txt');
  writeFileSync(file, 'thanks for the feedback');
  try {
    cliFixture(row, (fixture) => {
      assert.equal(JSON.parse(fixture.run(['mail-reply', message.to, 'incoming', file, '--dry-run'])).expectedThreadId, 'thread');
      assert.ok(fixture.calls().every((call) => !call.sql && !call.body?.methodCalls[0][0].endsWith('/set')));
      assert.equal(JSON.parse(fixture.run(['mail-reply', message.to, 'incoming', file])).submissionId, 'submission');
      assert.ok(fixture.calls().every((call) => !call.sql));
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI sends approved reply drafts without duplicates and preserves original outreach history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'outreach-send-reply-draft-test-'));
  const file = join(directory, 'reply.txt');
  writeFileSync(file, message.text);
  try {
    for (const command of ['mail-send-reply-draft', 'email-send-reply-draft']) {
      const tracked = command.startsWith('email-');
      cliFixture({ ...row, status: 'replied', sent_via: 'email', sent_at: 123 }, (fixture) => {
        const args = [command, tracked ? row.id : message.to, replySource.id, originalDraft.id, file];
        assert.equal(JSON.parse(fixture.run([...args, '--dry-run'])).draftId, originalDraft.id);
        assert.ok(fixture.calls().every((call) => !call.body?.methodCalls[0][0].endsWith('/set')));
        assert.equal(JSON.parse(fixture.run(args)).id, originalDraft.id);
        const calls = fixture.calls();
        assert.equal(calls.filter((call) => call.body?.methodCalls[0][0] === 'EmailSubmission/set').length, 1);
        assert.ok(calls.every((call) => call.body?.methodCalls[0][0] !== 'Email/set'));
        if (tracked) {
          const update = calls.find((call) => call.sql?.startsWith('UPDATE')).sql;
          assert.match(update, /original-draft/);
          assert.doesNotMatch(update, /sent_at|sent_via|message =|status =/);
        } else {
          assert.ok(calls.every((call) => !call.sql));
        }
      }, { 'Email/get': replyDraftReads(), 'EmailSubmission/set': draftSubmissionResponse });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
