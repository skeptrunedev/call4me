import assert from 'node:assert/strict';
import test from 'node:test';
import { smsConsent, SmsConsentError, SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from '../src/server/services/sms-consent';
import { d1 } from './sqlite-d1';

async function verified(db: D1Database, id = 'v1', account = 'acct_alice', country = 'US', status = 'verified', phone = '+12025550123') {
  await db.prepare(`INSERT INTO verified_numbers (id, account_id, phone_number, country, method, status, created_at, verified_at) VALUES (?, ?, ?, ?, 'call', ?, 1, 2)`)
    .bind(id, account, phone, country, status).run();
}

test('SMS consent records exact disclosure and retains history through withdrawal and renewed consent', async () => {
  const db = d1();
  const consent = smsConsent(db);
  await verified(db);
  await consent.subscribe('acct_alice', '+12025550123');
  assert.equal((await consent.current('acct_alice'))?.active, true);
  const original = await db.prepare('SELECT * FROM sms_consent_events').first<Record<string, unknown>>();
  assert.equal(original?.disclosure_text, SMS_CONSENT_TEXT);
  assert.equal(original?.disclosure_version, SMS_CONSENT_VERSION);
  await consent.revoke('acct_alice');
  assert.equal((await consent.current('acct_alice'))?.active, false);
  assert.ok((await consent.current('acct_alice'))?.revoked_at);
  await consent.revoke('acct_alice');
  await consent.subscribe('acct_alice', '+12025550123');
  assert.equal((await consent.current('acct_alice'))?.active, true);
  assert.deepEqual(await db.prepare('SELECT * FROM sms_consent_events WHERE id = 1').first(), original);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM sms_consent_events').first<{n:number}>())?.n, 3);
});

test('consent rejects someone else\'s number, pending numbers, and non US numbers', async () => {
  for (const [owner, country, status] of [['acct_bob', 'US', 'verified'], ['acct_alice', 'US', 'pending'], ['acct_alice', 'CA', 'verified']]) {
    const db = d1();
    await verified(db, 'v1', owner, country, status);
    await assert.rejects(smsConsent(db).subscribe('acct_alice', '+12025550123'), SmsConsentError);
    assert.equal(await smsConsent(db).current('acct_alice'), null);
  }
  await assert.rejects(smsConsent(d1()).subscribe('acct_alice', '+12025550123'), SmsConsentError);
});

test('removing verification disables permission and rechecking the same phone cannot revive it', async () => {
  const db = d1();
  await verified(db);
  const consent = smsConsent(db);
  await consent.subscribe('acct_alice', '+12025550123');
  await db.prepare("UPDATE verified_numbers SET status = 'removed' WHERE id = 'v1'").run();
  assert.equal((await consent.current('acct_alice'))?.active, false);
  await verified(db, 'v2');
  assert.equal((await consent.current('acct_alice'))?.active, false);
  await consent.subscribe('acct_alice', '+12025550123');
  assert.equal((await consent.current('acct_alice'))?.active, true);
  await consent.revoke('acct_bob');
  assert.equal((await consent.current('acct_alice'))?.active, true);
  assert.equal(await consent.current('acct_bob'), null);
});

test('changing the selected phone makes only the latest selection active', async () => {
  const db = d1();
  await verified(db);
  await verified(db, 'v2', 'acct_alice', 'US', 'verified', '+12025550124');
  await smsConsent(db).subscribe('acct_alice', '+12025550123');
  await smsConsent(db).subscribe('acct_alice', '+12025550124');
  assert.equal((await smsConsent(db).current('acct_alice'))?.phone_number, '+12025550124');
});


test('deleting verified ownership retains consent evidence but prevents delivery and still permits withdrawal', async () => {
  const db = d1();
  await db.prepare('PRAGMA foreign_keys = ON').run();
  await verified(db);
  await smsConsent(db).subscribe('acct_alice', '+12025550123');
  await db.prepare("DELETE FROM verified_numbers WHERE id = 'v1'").run();
  assert.equal((await smsConsent(db).current('acct_alice'))?.active, false);
  const evidence = await db.prepare('SELECT verified_number_id, phone_number, disclosure_text FROM sms_consent_events').first<{verified_number_id: string | null; phone_number: string; disclosure_text: string}>();
  assert.equal(evidence?.verified_number_id, null);
  assert.equal(evidence?.phone_number, '+12025550123');
  assert.equal(evidence?.disclosure_text, SMS_CONSENT_TEXT);
  await smsConsent(db).revoke('acct_alice');
  assert.ok((await smsConsent(db).current('acct_alice'))?.revoked_at);
});
