import assert from 'node:assert/strict';
import { test } from 'node:test';
import { articleConversions, combineArticles, dateRange } from '../scripts/article-conversions';
import { d1 } from './sqlite-d1';

test('article cohorts count accounts once, exclude internal and inbound calls, and preserve missing and late attribution', async () => {
  const db = d1();
  const touch = (at: number) => JSON.stringify({ source: 'google', medium: 'organic', landing: '/blog/codex-phone-calls', at });
  await db.prepare('UPDATE accounts SET created_at = 100, first_touch = ? WHERE id = ?').bind(touch(50), 'acct_alice').run();
  await db.prepare('UPDATE accounts SET created_at = 100, first_touch = ? WHERE id = ?').bind(touch(150), 'acct_bob').run();
  for (const [id, raw] of [['unknown', 'not json'], ['invalid', '{"landing":"/blog/codex-phone-calls","at":2}'], ['internal', touch(50)]]) {
    await db.prepare('INSERT INTO accounts (id,email,created_at,first_touch) VALUES (?,?,100,?)').bind(id, `${id}@example.com`, raw).run();
  }
  for (const [id, status, time] of [['paid1', 'paid', 150], ['paid2', 'paid', 160], ['refund', 'refunded', 170], ['future', 'paid', 400]] as const) {
    await db.prepare('INSERT INTO topups (id,account_id,amount_cents,status,created_at,paid_at) VALUES (?, ?, 1000, ?, ?, ?)').bind(id, id === 'future' ? 'acct_bob' : 'acct_alice', status, time, time).run();
  }
  for (const [id, account, direction, status, end] of [['c1','acct_alice','outbound','completed',160], ['c2','acct_alice','outbound','completed',170], ['c3','acct_bob','inbound','completed',160], ['c4','acct_bob','outbound','failed',160], ['c5','acct_bob','outbound','completed',400]] as const) {
    await db.prepare("INSERT INTO calls (id,account_id,direction,to_number,business,goal,brief,status,created_at,ended_at) VALUES (?, ?, ?, '+15550000000', 'fixture', 'fixture', '{}', ?, 150, ?)").bind(id, account, direction, status, end).run();
  }
  const rows = await articleConversions(db, 100, 200, ['INTERNAL@example.com']);
  assert.equal(rows.reduce((n,r) => n+r.signups,0), 4);
  assert.deepEqual({...rows.find(r=>r.attribution === 'recorded before signup')}, { landing:'/blog/codex-phone-calls',source:'google',medium:'organic',attribution:'recorded before signup',signups:1,fundedCheckoutAccounts:1,firstCompletedCallAccounts:1 });
  assert.equal(rows.find(r=>r.attribution === 'unknown')?.signups,2);
  assert.equal(rows.find(r=>r.attribution === 'recorded after signup')?.firstCompletedCallAccounts,0);
  assert.equal(rows.find(r=>r.attribution === 'recorded after signup')?.fundedCheckoutAccounts,0);
  const earlier = await articleConversions(db,100,200,['internal@example.com'],120);
  assert.equal(earlier.find(r=>r.attribution === 'unknown')?.signups,3);
  assert.equal(earlier.some(r=>r.attribution === 'recorded after signup'),false);
  const matured = await articleConversions(db,100,200,['internal@example.com'],500);
  assert.equal(matured.find(r=>r.attribution === 'recorded after signup')?.firstCompletedCallAccounts,1);
  assert.equal(matured.find(r=>r.attribution === 'recorded after signup')?.fundedCheckoutAccounts,1);
  const combined = combineArticles(['codex-phone-calls','not-observed'], rows, [{keys:['https://call4.me/blog/codex-phone-calls'],clicks:3,impressions:10,ctr:0.3,position:5}]);
  assert.equal(combined[0].signups,1);
  assert.equal(combined[0].laterObservedAccounts,1);
  assert.equal(combined[0].googleOrganic.firstCompletedCallAccounts,1);
  assert.equal(combined[1].search,null);
});

test('cohort boundaries include start, exclude end and do not count accounts from earlier periods', async () => {
  const db = d1();
  await db.prepare('UPDATE accounts SET created_at = 100 WHERE id = ?').bind('acct_alice').run();
  await db.prepare('UPDATE accounts SET created_at = 200 WHERE id = ?').bind('acct_bob').run();
  assert.equal((await articleConversions(db,100,200,[])).reduce((n,r)=>n+r.signups,0),1);
  assert.equal((await articleConversions(db,100,300,[],150)).reduce((n,r)=>n+r.signups,0),1);
  assert.equal((await articleConversions(db,201,300,[])).length,0);
  assert.deepEqual(dateRange('2026-10-01','2026-10-01'),{from:Date.parse('2026-10-01T00:00:00Z'),until:Date.parse('2026-10-02T00:00:00Z')});
  assert.throws(()=>dateRange('2026-02-30','2026-03-01'));
  assert.throws(()=>dateRange('2026-10-02','2026-10-01'));
});
