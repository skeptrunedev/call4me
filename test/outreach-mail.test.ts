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
  'Email/set': methodResult('Email/set', { created: { draft: { id: 'draft-email' } } }),
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
    const result = body ? { ...defaults, ...overrides }[body.methodCalls[0][0]] : sessionData;
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

// Stub only external boundaries so the actual CLI routing and SQL are exercised.
function cliFixture(row: Record<string, unknown>, run: (fixture: { run: (args: string[]) => string; calls: () => any[] }) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'outreach-mail-test-'));
  const log = join(directory, 'calls.jsonl');
  const preload = join(directory, 'fetch.mjs');
  writeFileSync(join(directory, 'npx'), `#!${process.execPath}\nimport {appendFileSync} from 'node:fs';\nappendFileSync(${JSON.stringify(log)},JSON.stringify({sql:process.argv.at(-1)})+'\\n');\nconsole.log(JSON.stringify([{results:[${JSON.stringify(row)}]}]));\n`, { mode: 0o755 });
  writeFileSync(preload, `import {appendFileSync} from 'node:fs';\nglobalThis.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;appendFileSync(${JSON.stringify(log)},JSON.stringify({url,body})+'\\n');return{ok:true,json:async()=>body?${JSON.stringify(defaults)}[body.methodCalls[0][0]]:${JSON.stringify(session)}}};\n`);
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
