import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fastmail } from '../scripts/outreach-mail.mjs';

const MAIL = 'urn:ietf:params:jmap:mail';
const SUBMISSION = 'urn:ietf:params:jmap:submission';
const bytes = Buffer.from([0, 255, 128, 10]);
const attachment = { partId: '2', blobId: 'blob/value', name: 'voice test.wav', type: 'audio/wav', size: bytes.length };
function mock({ attachments = [attachment], body = bytes, emailId = 'email', template = 'https://provider.example/download/{accountId}/{blobId}/{name}?type={type}' } = {}) {
  const calls: string[] = [];
  return { calls, client: fastmail({ token: 'test-token', fetchImpl: async (url: string, init: any) => {
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    if (url.includes('/download/')) {
      calls.push('download');
      assert.equal(url, 'https://provider.example/download/account/blob%2Fvalue/voice%20test.wav?type=audio%2Fwav');
      assert.equal(init.redirect, 'error');
      return new Response(body);
    }
    if (!init.body) return Response.json({ apiUrl: 'https://provider.example/api', downloadUrl: template, primaryAccounts: { [MAIL]: 'account' }, capabilities: { [MAIL]: {}, [SUBMISSION]: {} }, accounts: { account: { accountCapabilities: { [MAIL]: {}, [SUBMISSION]: {} } } } });
    const [method, args] = JSON.parse(init.body).methodCalls[0];
    calls.push(method);
    let list;
    if (method === 'Identity/get') list = [{ id: 'identity', email: 'me@skeptrune.com' }];
    else if (method === 'Mailbox/get') list = [{ id: 'drafts', role: 'drafts' }, { id: 'sent', role: 'sent' }];
    else if (method === 'Email/get') { assert.deepEqual(args.ids, ['email']); list = [{ id: emailId, attachments }]; }
    else throw new Error(`Unexpected mutation ${method}`);
    return Response.json({ methodResponses: [[method, { accountId: 'account', list }, 'outreach']] });
  } }) };
}

test('downloads exact attachment bytes privately using only reads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mail-download-'));
  try {
    const outputPath = join(directory, 'voice.wav');
    const { client, calls } = mock();
    const result = await client.downloadAttachment({ id: 'email', partId: '2', outputPath });
    assert.equal(result.size, bytes.length);
    assert.deepEqual(await readFile(outputPath), bytes);
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
    assert.deepEqual(calls, ['Identity/get', 'Mailbox/get', 'Email/get', 'download']);
    await assert.rejects(client.downloadAttachment({ id: 'email', partId: '2', outputPath }), /EEXIST/);
    assert.deepEqual(await readFile(outputPath), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('missing or ambiguous parts, wrong emails and invalid metadata never download', async () => {
  for (const options of [{ attachments: [] }, { attachments: [attachment, attachment] }, { emailId: 'other' }, { attachments: [{ ...attachment, blobId: '' }] }, { attachments: [{ ...attachment, size: 20_000_001 }] }, { template: 'http://provider.example/{accountId}/{blobId}' }]) {
    const { client, calls } = mock(options);
    await assert.rejects(client.downloadAttachment({ id: 'email', partId: '2', outputPath: '/unused' }));
    assert.ok(!calls.includes('download'));
  }
});

test('truncated and oversized responses do not create a local file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mail-download-'));
  try {
    for (const body of [Buffer.from([0]), Buffer.alloc(5)]) {
      const outputPath = join(directory, 'voice.wav');
      await assert.rejects(mock({ body }).client.downloadAttachment({ id: 'email', partId: '2', outputPath }), /size does not match/);
      await assert.rejects(stat(outputPath), /ENOENT/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('CLI routes attachment downloads without database access or email mutations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mail-download-cli-'));
  try {
    const preload = join(directory, 'fetch.mjs');
    const outputPath = join(directory, 'voice.wav');
    // Exercise real CLI parsing with a small provider boundary, rejecting any writes.
    await writeFile(preload, `globalThis.fetch=async(url,init)=>{
      if(url.includes('/download/')) return new Response(Buffer.from([0,255,128,10]));
      if(!init.body) return Response.json({apiUrl:'https://provider.example/api',downloadUrl:'https://provider.example/download/{accountId}/{blobId}/{name}?type={type}',primaryAccounts:{'${MAIL}':'account'},capabilities:{'${MAIL}':{},'${SUBMISSION}':{}},accounts:{account:{accountCapabilities:{'${MAIL}':{},'${SUBMISSION}':{}}}}});
      const [method,args]=JSON.parse(init.body).methodCalls[0];
      const list=method==='Identity/get'?[{id:'identity',email:'me@skeptrune.com'}]:method==='Mailbox/get'?[{id:'drafts',role:'drafts'},{id:'sent',role:'sent'}]:method==='Email/get'?[{id:args.ids[0],attachments:[${JSON.stringify(attachment)}]}]:null;
      if(!list)throw new Error('Unexpected mutation '+method);
      return Response.json({methodResponses:[[method,{accountId:'account',list},'outreach']]});
    };`);
    const result = JSON.parse(execFileSync(process.execPath, ['--import', preload, 'scripts/outreach.mjs', 'mail-attachment', 'email', '2', outputPath], { encoding: 'utf8', env: { ...process.env, FASTMAIL_JMAP_TOKEN: 'test-token', PATH: directory } }));
    assert.equal(result.partId, '2');
    assert.deepEqual(await readFile(outputPath), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
