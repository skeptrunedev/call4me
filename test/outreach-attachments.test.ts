import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fastmail, messageHtml, readPdfAttachments } from '../scripts/outreach-mail.mjs';

const CORE = 'urn:ietf:params:jmap:core';
const MAIL = 'urn:ietf:params:jmap:mail';
const SUBMISSION = 'urn:ietf:params:jmap:submission';
const message = { to: 'support@example.com', subject: 'Verification question', text: 'please review the attached documents\n\nnick' };

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'outreach-attachments-'));
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
  ].entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  const paths = ['articles.pdf', 'receipt.pdf'].map(name => join(directory, name));
  paths.forEach(path => writeFileSync(path, pdf));
  const body = join(directory, 'message.txt');
  writeFileSync(body, `Subject: ${message.subject}\n\n${message.text}`);
  return { directory, paths, bytes: Buffer.from(pdf), body, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

function mock({ uploadChange = {}, draftChange = {}, limits = {} }: { uploadChange?: object; draftChange?: object; limits?: object } = {}) {
  const calls: { url: string; method: string; body?: any }[] = [];
  let draft: any;
  let uploads = 0;
  const session = {
    apiUrl: 'https://provider.example/api', uploadUrl: 'https://provider.example/upload/{accountId}/',
    primaryAccounts: { [MAIL]: 'account' }, capabilities: { [CORE]: { maxSizeUpload: 20_000_000 }, [MAIL]: {}, [SUBMISSION]: {} },
    accounts: { account: { accountCapabilities: { [MAIL]: { maxSizeAttachmentsPerEmail: 40_000_000, ...limits }, [SUBMISSION]: {} } } },
  };
  const result = (method: string, data: object) => Response.json({ methodResponses: [[method, { accountId: 'account', ...data }, 'outreach']] });
  const fetchImpl = async (url: string, init: any) => {
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    if (url.includes('/upload/')) {
      calls.push({ url, method: 'upload', body: init.body });
      assert.equal(init.headers['Content-Type'], 'application/pdf');
      assert.equal(init.redirect, 'error');
      return Response.json({ accountId: 'account', blobId: `blob${++uploads}`, type: 'application/pdf', size: init.body.length, ...uploadChange });
    }
    if (!init.body) { calls.push({ url, method: 'session' }); return Response.json(session); }
    const [method, args] = JSON.parse(init.body).methodCalls[0];
    calls.push({ url, method, body: args });
    if (method === 'Identity/get') return result(method, { list: [{ id: 'identity', email: 'me@skeptrune.com' }] });
    if (method === 'Mailbox/get') return result(method, { list: [{ id: 'drafts', role: 'drafts' }, { id: 'sent', role: 'sent' }] });
    if (method === 'Email/set') { draft = args.create.draft; return result(method, { created: { draft: { id: 'draft' } } }); }
    if (method === 'Email/get') return result(method, { state: 'email-state', list: [{ ...draft, id: 'draft', hasAttachment: true, ...draftChange }] });
    if (method === 'EmailSubmission/set') return Response.json({ methodResponses: [
      [method, { accountId: 'account', created: { submission: { id: 'submission' } } }, 'outreach'],
      ['Email/set', { accountId: 'account', updated: { draft: null } }, 'outreach'],
    ] });
    throw new Error(`Unexpected method ${method}`);
  };
  return { calls, client: fastmail({ token: 'test-token', fetchImpl }) };
}

test('attachment send uploads exact bytes and verifies draft before submitting', async () => {
  const f = fixture();
  try {
    const { client, calls } = mock();
    const result = await client.send({ ...message, attachmentPaths: f.paths });
    assert.equal(result.submissionId, 'submission');
    assert.deepEqual(calls.map(call => call.method), ['session', 'Identity/get', 'Mailbox/get', 'upload', 'upload', 'Email/set', 'Email/get', 'EmailSubmission/set']);
    for (const call of calls.filter(call => call.method === 'upload')) {
      assert.equal(call.url, 'https://provider.example/upload/account/');
      assert.deepEqual(call.body, f.bytes);
    }
    const draft = calls.find(call => call.method === 'Email/set')!.body.create.draft;
    assert.equal(draft.bodyValues.html.value, messageHtml(message.text));
    assert.deepEqual(draft.attachments, ['articles.pdf', 'receipt.pdf'].map((name, index) => ({ name, type: 'application/pdf', size: f.bytes.length, blobId: `blob${index + 1}`, disposition: 'attachment' })));
  } finally { f.cleanup(); }
});

test('all files must validate before any provider request', async () => {
  const f = fixture();
  try {
    const invalid = join(f.directory, 'bad.pdf');
    writeFileSync(invalid, '%PDF-1.4\nnot a PDF\n%%EOF');
    for (const path of [invalid, join(f.directory, 'missing.pdf')]) {
      const { client, calls } = mock();
      await assert.rejects(client.send({ ...message, attachmentPaths: [f.paths[0], path] }));
      assert.equal(calls.length, 0);
    }
    await assert.rejects(readPdfAttachments([f.paths[0], f.paths[0]]), /Duplicate attachment/);
  } finally { f.cleanup(); }
});

test('upload account, type, size and blob failures cannot create or submit an email', async () => {
  const f = fixture();
  try {
    for (const uploadChange of [{ accountId: 'wrong' }, { size: 1 }, { type: 'text/plain' }, { blobId: '' }]) {
      const { client, calls } = mock({ uploadChange });
      await assert.rejects(client.send({ ...message, attachmentPaths: f.paths }), /upload metadata mismatch/);
      assert.ok(!calls.some(call => call.method.endsWith('/set')));
    }
    const { client, calls } = mock({ limits: { maxSizeAttachmentsPerEmail: f.bytes.length } });
    await assert.rejects(client.send({ ...message, attachmentPaths: f.paths }), /provider email size limit/);
    assert.ok(!calls.some(call => call.method === 'upload'));
  } finally { f.cleanup(); }
});

test('draft body, subject, recipient and attachment changes block submission and retain draft ID', async () => {
  const f = fixture();
  try {
    const expected = { blobId: 'blob1', name: 'articles.pdf', type: 'application/pdf', size: f.bytes.length, disposition: 'attachment' };
    const changes = [
      { subject: 'different' }, { to: [{ email: 'wrong@example.com' }] },
      { bodyValues: { html: { value: 'different' } } }, { attachments: [] }, { hasAttachment: false },
      ...Object.entries({ blobId: 'wrong', name: 'wrong.pdf', type: 'text/plain', size: 1, disposition: 'inline' }).map(([key, value]) => ({ attachments: [{ ...expected, [key]: value }] })),
    ];
    for (const draftChange of changes) {
      const { client, calls } = mock({ draftChange });
      await assert.rejects(client.send({ ...message, attachmentPaths: [f.paths[0]] }), /draft draft was not submitted; inspect before retrying/);
      assert.ok(!calls.some(call => call.method === 'EmailSubmission/set'));
    }
  } finally { f.cleanup(); }
});

test('mail-send previews repeatable PDF attachments without credentials and rejects flags on other commands', () => {
  const f = fixture();
  try {
    const output = execFileSync(process.execPath, ['scripts/outreach.mjs', 'mail-send', message.to, f.body, '--attach', f.paths[0], '--attach', f.paths[1], '--dry-run'], { encoding: 'utf8', env: { ...process.env, FASTMAIL_JMAP_TOKEN: '' } });
    const preview = JSON.parse(output);
    assert.equal(preview.subject, message.subject);
    assert.deepEqual(preview.attachments.map((item: any) => item.name), ['articles.pdf', 'receipt.pdf']);
    assert.ok(preview.attachments.every((item: any) => item.size === f.bytes.length && !item.bytes));
    assert.throws(() => execFileSync(process.execPath, ['scripts/outreach.mjs', 'mail-read', 'id', '--attach', f.paths[0]], { stdio: 'pipe' }), /--attach is supported only for mail-send/);
    assert.throws(() => execFileSync(process.execPath, ['scripts/outreach.mjs', 'mail-send', message.to, f.body, '--attach', '--dry-run'], { stdio: 'pipe' }), /usage:/);
  } finally { f.cleanup(); }
});
