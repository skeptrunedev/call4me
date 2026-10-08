import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { d1 } from './sqlite-d1';
import { sha256Hex } from '../src/server/lib/keys';
import { createCampaignUnsubscribe, createCampaignUnsubscribes, validCampaignUnsubscribe } from '../src/server/services/campaign-unsubscribe';
import { unsubscribeUrl } from '../src/server/services/drip';

// Route imports include a Worker Durable Object; retain actual routing and SQLite behavior.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,${encodeURIComponent('export class DurableObject {}')}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { pub } = await import('../src/server/routes/public');
const origin = 'https://call4.me';
const secret = 'test-signing-secret';

test('campaign tokens are random, stored only as hashes and restricted to their account', async () => {
  const db = d1();
  const first = new URL(await createCampaignUnsubscribe(db, origin, 'acct_alice'));
  const second = new URL(await createCampaignUnsubscribe(db, origin, 'acct_alice'));
  assert.equal(first.pathname, '/unsubscribe');
  assert.equal(first.searchParams.get('a'), 'acct_alice');
  const token = first.searchParams.get('token')!;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, second.searchParams.get('token'));
  const stored = await db.prepare('SELECT * FROM email_unsubscribe_tokens WHERE token_hash = ?').bind(await sha256Hex(token)).first();
  assert.deepEqual({ ...stored }, { token_hash: await sha256Hex(token), account_id: 'acct_alice' });
  assert.equal(await validCampaignUnsubscribe(db, 'acct_alice', token), true);
  assert.equal(await validCampaignUnsubscribe(db, 'acct_bob', token), false);
  for (const invalid of ['', token.toUpperCase(), ` ${token}`, token.slice(1), `${token}0`, 'f'.repeat(64), token.replace(/^./, token[0] === '0' ? '1' : '0')]) {
    assert.equal(await validCampaignUnsubscribe(db, 'acct_alice', invalid), false);
  }
  await db.prepare('PRAGMA foreign_keys = ON').run();
  await db.prepare('DELETE FROM accounts WHERE id = ?').bind('acct_alice').run();
  assert.equal(await validCampaignUnsubscribe(db, 'acct_alice', token), false);
});

test('bulk issuance stays within D1 parameter limits and validates every generated link', async () => {
  const db = d1();
  const accountIds = Array.from({ length: 83 }, (_, i) => `account_${i}`);
  for (const id of accountIds) await db.prepare('INSERT INTO accounts (id, email, created_at) VALUES (?, ?, 0)').bind(id, `${id}@example.com`).run();
  const parameterCounts: number[] = [];
  const tracked = {
    prepare(sql: string) {
      assert.match(sql, /^INSERT INTO email_unsubscribe_tokens/);
      return { bind(...args: unknown[]) { parameterCounts.push(args.length); return db.prepare(sql).bind(...args); } };
    },
  } as unknown as D1Database;
  const links = await createCampaignUnsubscribes(tracked, origin, accountIds);
  assert.deepEqual(parameterCounts, [80, 80, 6]);
  assert.deepEqual(links.map((link) => link.accountId), accountIds);
  for (const link of links) assert.equal(await validCampaignUnsubscribe(db, link.accountId, new URL(link.url).searchParams.get('token')!), true);
  const count = parameterCounts.length;
  await assert.rejects(createCampaignUnsubscribes(tracked, origin, ['acct_alice', 'acct_alice']), /unique/);
  await assert.rejects(createCampaignUnsubscribes(tracked, origin, ['']), /nonempty/);
  assert.equal(parameterCounts.length, count);
});

test('opening a campaign link preserves its token and only POST opts out the intended account', async () => {
  const db = d1();
  const env = { DB: db, BETTER_AUTH_SECRET: secret } as Env;
  const url = new URL(await createCampaignUnsubscribe(db, origin, 'acct_alice'));
  const response = await pub.request(url.href, {}, env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<form method="post" action="\/unsubscribe"/);
  assert.ok(html.includes(`name="token" value="${url.searchParams.get('token')}"`));
  assert.deepEqual({ ...await db.prepare('SELECT email_opt_out FROM accounts WHERE id = ?').bind('acct_alice').first() }, { email_opt_out: 0 });
  for (let i = 0; i < 2; i++) {
    const posted = await pub.request('/unsubscribe', { method: 'POST', body: new URLSearchParams(url.searchParams) }, env);
    assert.equal(posted.status, 200);
    assert.match(await posted.text(), /unsubscribed/);
  }
  assert.deepEqual({ ...await db.prepare('SELECT email_opt_out FROM accounts WHERE id = ?').bind('acct_alice').first() }, { email_opt_out: 1 });
  assert.deepEqual({ ...await db.prepare('SELECT email_opt_out FROM accounts WHERE id = ?').bind('acct_bob').first() }, { email_opt_out: 0 });
});

test('tampered account, missing token and forged token cannot unsubscribe anyone', async () => {
  const db = d1();
  const env = { DB: db, BETTER_AUTH_SECRET: secret } as Env;
  const link = new URL(await createCampaignUnsubscribe(db, origin, 'acct_alice'));
  for (const params of [
    new URLSearchParams({ a: 'acct_bob', token: link.searchParams.get('token')! }),
    new URLSearchParams({ a: 'acct_alice' }),
    new URLSearchParams({ a: 'acct_alice', token: '0'.repeat(64) }),
  ]) {
    assert.equal((await pub.request(`/unsubscribe?${params}`, {}, env)).status, 400);
    assert.equal((await pub.request('/unsubscribe', { method: 'POST', body: params }, env)).status, 400);
  }
  assert.deepEqual({ ...await db.prepare('SELECT COUNT(*) AS count FROM accounts WHERE email_opt_out = 1').first() }, { count: 0 });
});

test('existing signed unsubscribe links still confirm and update through POST', async () => {
  const db = d1();
  const env = { DB: db, BETTER_AUTH_SECRET: secret } as Env;
  const link = new URL(await unsubscribeUrl(origin, secret, 'acct_alice'));
  const opened = await pub.request(link.href, {}, env);
  assert.equal(opened.status, 200);
  assert.ok((await opened.text()).includes(`name="s" value="${link.searchParams.get('s')}"`));
  assert.equal((await pub.request('/unsubscribe', { method: 'POST', body: link.searchParams }, env)).status, 200);
  assert.deepEqual({ ...await db.prepare('SELECT email_opt_out FROM accounts WHERE id = ?').bind('acct_alice').first() }, { email_opt_out: 1 });
});
