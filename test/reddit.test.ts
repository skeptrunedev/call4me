import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { decodeRedditTouch, encodeRedditTouch, redditPayload, redditPixelScript, redditTouchCookie, redditTouchOf, redditTouchSetCookie, sendReddit, type RedditTouch } from '../src/server/lib/reddit';

const now = 1_791_244_800_000;
const age = 90 * 24 * 60 * 60 * 1000;
const id = '11111111-1111-4111-8111-111111111111';
const visitorId = '22222222-2222-4222-8222-222222222222';
const uuid = '33333333-3333-4333-8333-333333333333';
const touch: RedditTouch = { id, visitorId, clickId: 'AbC_123', uuid, campaign: 'Agent phone calls', adGroup: 'group', adId: 'ad', audience: 'developers', creative: 'demo', landing: 'https://call4.me/', at: now };
const headerOf = (value = touch) => `c4_reddit=${encodeRedditTouch(value)}`;

test('touch cookies round trip bounded attribution and reject corrupt, future, expired and oversized data', () => {
  assert.deepEqual(redditTouchCookie(`other=ok; ${headerOf()}`, now), touch);
  assert.deepEqual(decodeRedditTouch(JSON.stringify(touch), now), touch);
  assert.deepEqual(decodeRedditTouch(encodeRedditTouch({ ...touch, campaign: 'Téléphone' }), now)?.campaign, 'Téléphone');
  for (const bad of ['not-json', '%bad', 'a'.repeat(3801), encodeRedditTouch({ ...touch, at: now + 1 }), encodeRedditTouch({ ...touch, at: now - age - 1 }), encodeRedditTouch({ ...touch, campaign: 'x'.repeat(129) }), encodeRedditTouch({ ...touch, campaign: 'line\nbreak' }), encodeRedditTouch({ ...touch, id: 'bad' }), encodeRedditTouch({ ...touch, landing: 'https://call4.me/?key=secret' })]) {
    assert.equal(decodeRedditTouch(bad, now), null);
  }
  assert.ok(decodeRedditTouch(encodeRedditTouch({ ...touch, at: now - age }), now));
  assert.equal(redditTouchCookie(undefined, now), null);
  assert.equal(decodeRedditTouch(JSON.stringify({ ...touch, at: now + 1 }), now), null);
  assert.equal(decodeRedditTouch(JSON.stringify({ ...touch, landing: 'https://call4.me/?key=secret' }), now), null);
  const polluted = { ...touch, email: 'private@example.com', token: 'secret' };
  assert.deepEqual(decodeRedditTouch(encodeRedditTouch(polluted), now), touch);
  assert.match(redditTouchSetCookie(touch), /^c4_reddit=[a-zA-Z0-9_-]+; Path=\/; Max-Age=7776000; Secure; HttpOnly; SameSite=Lax$/);
});

test('only paid Reddit arrivals create touches and clean their landing URLs', () => {
  const empty = new Headers();
  for (const address of ['https://call4.me/', 'https://call4.me/?utm_source=reddit', 'https://call4.me/?utm_source=reddit&utm_medium=organic', 'https://call4.me/?utm_source=google&utm_medium=cpc', 'https://call4.me/?rdt_cid=%0Abad']) {
    assert.equal(redditTouchOf(new URL(address), empty, now), null);
  }
  for (const medium of ['paid_social', 'cpc', 'paid']) {
    const result = redditTouchOf(new URL(`https://call4.me/blog?utm_source=Reddit&utm_medium=${medium}&utm_campaign=campaign&utm_term=audience&utm_content=creative&adgroup_id=g&ad_id=a#token`), empty, now)!;
    assert.equal(result.landing, 'https://call4.me/blog');
    assert.equal(result.campaign, 'campaign');
    assert.equal(result.audience, 'audience');
    assert.equal(result.creative, 'creative');
    assert.equal(result.adGroup, 'g');
    assert.equal(result.adId, 'a');
    assert.equal(result.clickId, null);
    assert.notEqual(result.id, result.visitorId);
  }
  const result = redditTouchOf(new URL('https://call4.me/?rdt_cid=Case_Sensitive-Click&campaign_id=c&adgroup_id=g&ad_id=a'), empty, now)!;
  assert.equal(result.clickId, 'Case_Sensitive-Click');
  assert.equal(result.campaign, 'c');
});

test('new clicks retain the visitor, ordinary visits retain acquisition, and same click reloads keep the original timestamp', () => {
  const headers = new Headers({ cookie: headerOf() });
  const next = redditTouchOf(new URL('https://call4.me/?rdt_cid=NewClick'), headers, now + 1000)!;
  assert.equal(next.visitorId, visitorId);
  assert.notEqual(next.id, id);
  assert.equal(next.at, now + 1000);
  assert.equal(next.clickId, 'NewClick');
  assert.deepEqual(redditTouchOf(new URL('https://call4.me/account?session_id=secret'), headers, now + 1000), touch);
  assert.deepEqual(redditTouchOf(new URL('https://call4.me/?rdt_cid=AbC_123'), headers, now + 1000), touch);
  assert.equal(redditTouchOf(new URL('https://call4.me/'), new Headers({ cookie: headerOf({ ...touch, at: now - age - 1 }) }), now), null);
});

test('Reddit browser UUID follows the official timestamp format and selects the oldest valid value', () => {
  const newer = '44444444-4444-4444-8444-444444444444';
  const headers = new Headers({ cookie: `_rdt_uuid=${now}.${newer}; _rdt_uuid=${now - 1000}.${uuid}; _rdt_uuid=${now + 1}.${id}` });
  assert.equal(redditTouchOf(new URL('https://call4.me/?rdt_cid=click'), headers, now)?.uuid, uuid);
  for (const bad of [uuid, `${now}.bad`, `${now - age - 1}.${uuid}`, `${now + 1}.${uuid}`]) {
    assert.equal(redditTouchOf(new URL('https://call4.me/?rdt_cid=click'), new Headers({ cookie: `_rdt_uuid=${bad}` }), now)?.uuid, null);
  }
  const later = redditTouchOf(new URL('https://call4.me/account'), new Headers({ cookie: `${headerOf({ ...touch, uuid: null })}; _rdt_uuid=${now}.${uuid}` }), now)!;
  assert.equal(later.id, id);
  assert.equal(later.uuid, uuid);
});

test('paid UTM reloads retain their touch, while a new campaign or creative creates a touch for the same visitor', () => {
  const address = 'https://call4.me/blog?utm_source=reddit&utm_medium=paid_social&utm_campaign=campaign&utm_term=audience&utm_content=demo&adgroup_id=group&ad_id=ad';
  const first = redditTouchOf(new URL(address), new Headers(), now)!;
  const headers = new Headers({ cookie: headerOf(first) });
  assert.deepEqual(redditTouchOf(new URL(address), headers, now + 1000), first);
  for (const changed of [address.replace('campaign=campaign', 'campaign=next'), address.replace('content=demo', 'content=next'), address.replace('ad_id=ad', 'ad_id=next')]) {
    const next = redditTouchOf(new URL(changed), headers, now + 1000)!;
    assert.notEqual(next.id, first.id);
    assert.equal(next.visitorId, first.visitorId);
    assert.equal(next.at, now + 1000);
  }
});

test('CAPI sends exact v3 units, hashed identity and bounded conversion metadata without campaign or customer content', async () => {
  const result = await redditPayload({ accountId: 'private-account', touch, events: [
    { id: 'signup:account', at: now, type: 'SIGN_UP', url: 'https://call4.me/welcome?key=secret#token' },
    { id: 'payment:pi_1', at: now + 1, type: 'PURCHASE', value: 20.25, currency: 'USD', actionSource: 'WEBSITE', url: 'https://call4.me/add-funds?session_id=secret' },
    { id: 'first-call:call_1', at: now + 2, type: 'CUSTOM', name: 'FirstCompletedCall', actionSource: 'OTHER', url: 'https://call4.me/private?transcript=secret' },
  ] });
  const events = (result.data as { events: Record<string, unknown>[] }).events;
  const external_id = createHash('sha256').update('private-account').digest('hex');
  assert.deepEqual(events[0], { event_at: now, action_source: 'WEBSITE', type: { tracking_type: 'SIGN_UP' }, metadata: { conversion_id: 'signup:account' }, user: { external_id, uuid }, click_id: 'AbC_123', event_source_url: 'https://call4.me/welcome' });
  assert.deepEqual(events[1].metadata, { conversion_id: 'payment:pi_1', value: 20.25, currency: 'USD' });
  assert.equal(events[2].action_source, 'OTHER');
  assert.equal(events[2].event_source_url, undefined);
  assert.deepEqual(events[2].type, { tracking_type: 'CUSTOM', custom_event_name: 'FirstCompletedCall' });
  assert.doesNotMatch(JSON.stringify(result), /private-account|transcript|session_id|secret|developers|Agent phone calls/);
  const noTouch = await redditPayload({ accountId: 'a', touch: null, events: [{ id: 'call:1', at: now, type: 'CUSTOM', name: 'FirstCompletedCall' }] });
  assert.equal((noTouch.data as { events: Record<string, unknown>[] }).events[0].click_id, undefined);
});

test('CAPI rejects malformed timestamps, custom names and currency values before delivery', async () => {
  const base = { id: 'payment', at: now, type: 'PURCHASE' as const };
  for (const event of [{ ...base, at: now / 1000 }, { ...base, value: NaN }, { ...base, value: -1 }, { ...base, currency: 'usd' }, { ...base, type: 'CUSTOM' as const }, { ...base, type: 'CUSTOM' as const, name: 'x'.repeat(65) }]) {
    await assert.rejects(redditPayload({ accountId: 'a', touch: null, events: [event] }), RangeError);
  }
});

test('Pixel sanitizes the address before initialization, sends only PageVisit and receives prehashed identity', () => {
  const externalId = createHash('sha256').update('account').digest('hex');
  const appended: Record<string, unknown>[] = [];
  const window: Record<string, unknown> = {};
  let clean: unknown;
  runInNewContext(redditPixelScript('a2_test', externalId), {
    window, URLSearchParams, location: { origin: 'https://call4.me', pathname: '/blog', search: '?key=secret&rdt_cid=Case_Click', hash: '#secret' },
    history: { state: null, replaceState: (_state: unknown, _title: string, url: unknown) => { clean = url; } },
    document: { head: { appendChild: (script: Record<string, unknown>) => appended.push(script) }, createElement: () => ({}) },
  });
  assert.equal(clean, 'https://call4.me/blog');
  const queue = (window.rdt as { callQueue: IArguments[] }).callQueue.map((args) => Array.from(args));
  assert.equal(JSON.stringify(queue), JSON.stringify([['init', 'a2_test', { externalId }], ['track', 'PageVisit']]));
  assert.equal(appended[0].src, 'https://www.redditstatic.com/ads/pixel.js');
  assert.doesNotMatch(redditPixelScript('a2_test', 'private-account'), /private-account/);
  assert.equal(redditPixelScript('</script>', externalId), '');
  const blocked: Record<string, unknown> = {};
  runInNewContext(redditPixelScript('a2_test', null), { window: blocked, URLSearchParams, location: { origin: 'https://call4.me', pathname: '/', search: '' }, history: { replaceState: () => { throw new Error('blocked'); } } });
  assert.equal(blocked.rdt, undefined);
});

test('Pixel preserves a valid native click cookie before URL cleanup and ignores malformed click ids', () => {
  for (const [query, expected] of [['?rdt_cid=Case_Click', '_rdt_cid=Case_Click; Path=/; Max-Age=7776000; Secure; SameSite=Lax'], ['?rdt_cid=%0Abad', ''], ['?rdt_cid=' + 'x'.repeat(513), '']]) {
    const document = { cookie: '', head: { appendChild: () => {} }, createElement: () => ({}) };
    let cookieAtCleanup: string | null = null;
    runInNewContext(redditPixelScript('a2_test', null), {
      window: {}, URLSearchParams, document, location: { origin: 'https://call4.me', pathname: '/', search: query },
      history: { state: null, replaceState: () => { cookieAtCleanup = document.cookie; } },
    });
    assert.equal(document.cookie, expected);
    assert.equal(cookieAtCleanup, expected);
  }
});

test('delivery classifies HTTP and network failures, keeps token out of URL, and sets a timeout', async () => {
  const original = globalThis.fetch;
  try {
    let status = 200;
    let requested = 0;
    globalThis.fetch = (async (input: string, init: RequestInit) => {
      requested++;
      assert.equal(input, 'https://ads-api.reddit.com/api/v3/pixels/a2_test/conversion_events');
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer secret-token');
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal);
      return new Response(null, { status });
    }) as typeof fetch;
    assert.deepEqual(await sendReddit({}, {}), { ok: false, retryable: false, status: null });
    assert.equal(requested, 0);
    for (const code of [200, 204, 400, 401, 403, 404, 429, 500, 503]) {
      status = code;
      assert.deepEqual(await sendReddit({ REDDIT_PIXEL_ID: 'a2_test', REDDIT_CAPI_TOKEN: 'secret-token' }, {}), { ok: code < 300, retryable: code === 429 || code >= 500, status: code });
    }
    globalThis.fetch = (async () => { throw new Error('network failed'); }) as typeof fetch;
    assert.deepEqual(await sendReddit({ REDDIT_PIXEL_ID: 'a2_test', REDDIT_CAPI_TOKEN: 'secret-token' }, {}), { ok: false, retryable: true, status: null });
  } finally {
    globalThis.fetch = original;
  }
});
