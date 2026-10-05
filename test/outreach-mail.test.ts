import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fastmail, messageHtml, statusAfterDraft } from '../scripts/outreach-mail.mjs';

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
