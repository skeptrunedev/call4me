import assert from 'node:assert/strict';
import test from 'node:test';
import { accounts } from '../src/server/services/accounts';
import { attachRedditVisit, redditConversions, redditEmailHash, redditPayload, redditVisitOf, saveRedditVisit } from '../src/server/lib/reddit';
import { d1 } from './sqlite-d1';

test('a Reddit landing captures click, campaign, audience, ad and creative metadata server-side', async () => {
  const db = d1();
  const headers = new Headers({ cookie: 'c4_rv=v_existing123', referer: 'https://www.reddit.com/r/ClaudeAI/', 'cf-connecting-ip': '203.0.113.8', 'user-agent': 'Browser/1' });
  const visit = redditVisitOf(
    new URL('https://call4.me/?utm_source=reddit&utm_medium=paid&utm_campaign=agents&campaign_id=c1&utm_term=claude-code&ad_group_id=g1&utm_content=demo&ad_id=a1&creative_id=cr1&rdt_cid=click_ABC'),
    headers,
    1_790_000_000_000,
  )!;
  assert.deepEqual(
    { click: visit.rdt_cid, campaign: visit.campaign_name, campaignId: visit.campaign_id, audience: visit.audience, group: visit.ad_group_id, ad: visit.ad_id, creative: visit.creative_id },
    { click: 'click_ABC', campaign: 'agents', campaignId: 'c1', audience: 'claude-code', group: 'g1', ad: 'a1', creative: 'cr1' },
  );
  await saveRedditVisit(db, visit);
  await attachRedditVisit(db, 'acct_alice', visit.id);
  const account = await accounts(db).byId('acct_alice');
  assert.equal(account?.reddit_first_visit_id, visit.id);
  assert.equal(account?.reddit_last_visit_id, visit.id);
});

test('CAPI payloads use stable ids and approved matching data, never call-sensitive data', async () => {
  const db = d1();
  const visit = redditVisitOf(new URL('https://call4.me/install?rdt_cid=click_1&utm_source=reddit&utm_campaign=codex'), new Headers({ 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Browser/2' }), 1_790_000_000_000)!;
  await saveRedditVisit(db, visit);
  await attachRedditVisit(db, 'acct_alice', visit.id);
  const account = (await accounts(db).byId('acct_alice'))!;
  const payload = await redditPayload(db, account, { trackingType: 'CUSTOM', customEventName: 'First completed call', conversionId: 'first_completed_call:acct_alice', sourceRef: 'acct_alice', at: 1_790_000_001_000, website: false });
  assert.deepEqual(payload.type, { tracking_type: 'CUSTOM', custom_event_name: 'First completed call' });
  assert.equal((payload.metadata as { conversion_id: string }).conversion_id, 'first_completed_call:acct_alice');
  assert.equal(payload.click_id, 'click_1');
  assert.equal(payload.action_source, 'OTHER');
  assert.equal((payload.user as { email: string }).email, await redditEmailHash('alice@example.com'));
  assert.equal((payload.user as { uuid?: string }).uuid, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /alice@example\.com|phone|destination|transcript|category|brief/i);
});

test('CAPI retries strip the legacy internal visitor id from Reddit uuid', async () => {
  const db = d1();
  const account = (await accounts(db).byId('acct_alice'))!;
  const conversionId = 'signup:legacy-visitor-id';
  const payload = await redditPayload(db, account, { trackingType: 'SIGN_UP', conversionId, sourceRef: conversionId, at: 1_790_000_001_500, website: false });
  (payload.user as Record<string, unknown>).uuid = 'v_internal1234567890';
  await db
    .prepare(`INSERT INTO reddit_conversions (conversion_id, account_id, event_name, source_ref, event_at, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`)
    .bind(conversionId, account.id, 'SIGN_UP', conversionId, 1_790_000_001_500, JSON.stringify(payload), 1_790_000_001_500)
    .run();

  const original = globalThis.fetch;
  let sent: { data: { events: { user: { uuid?: string; external_id: string } }[] } } | null = null;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return Response.json({ data: { message: 'Successfully processed 1 conversion events.' } });
  }) as typeof fetch;
  try {
    await redditConversions({ DB: db, REDDIT_PIXEL_ID: 'p2_pixel', REDDIT_CAPI_TOKEN: 'token', REDDIT_TEST_ID: '' }).deliver(conversionId);
  } finally {
    globalThis.fetch = original;
  }

  assert.equal(sent!.data.events[0].user.uuid, undefined);
  assert.ok(sent!.data.events[0].user.external_id);
  const audit = await db.prepare(`SELECT status, last_http_status FROM reddit_conversions WHERE conversion_id = ?`).bind(conversionId).first();
  assert.deepEqual({ ...audit }, { status: 'sent', last_http_status: 200 });
});

test('CAPI delivery is persisted with response status for Events Manager auditing', async () => {
  const db = d1();
  const account = (await accounts(db).byId('acct_alice'))!;
  const original = globalThis.fetch;
  let sent: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent = { url, init };
    return Response.json({ data: { message: 'Successfully processed 1 conversion events.' } });
  }) as typeof fetch;
  try {
    await redditConversions({ DB: db, REDDIT_PIXEL_ID: 'p2_pixel', REDDIT_CAPI_TOKEN: 'token', REDDIT_TEST_ID: 'test-123' }).queue(account, {
      trackingType: 'PURCHASE',
      conversionId: 'purchase:cs_1',
      sourceRef: 'cs_1',
      at: 1_790_000_002_000,
      value: 20,
      website: false,
    });
  } finally {
    globalThis.fetch = original;
  }
  assert.match(sent!.url, /\/pixels\/p2_pixel\/conversion_events$/);
  assert.equal((sent!.init.headers as Record<string, string>).authorization, 'Bearer token');
  const body = JSON.parse(String(sent!.init.body)) as { data: { test_id: string; events: { metadata: { conversion_id: string } }[] } };
  assert.equal(body.data.test_id, 'test-123');
  assert.equal(body.data.events[0].metadata.conversion_id, 'purchase:cs_1');
  const audit = await db.prepare(`SELECT status, attempts, last_http_status, last_error FROM reddit_conversions WHERE conversion_id = ?`).bind('purchase:cs_1').first<{ status: string; attempts: number; last_http_status: number; last_error: string | null }>();
  assert.deepEqual({ ...audit }, { status: 'sent', attempts: 1, last_http_status: 200, last_error: null });
});
