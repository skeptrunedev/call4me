import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { GRAPH_API_VERSION, metaBrowser, sendMeta } from '../src/server/lib/meta';
import { analytics } from '../src/server/services/analytics';
import type { Account } from '../src/server/services/accounts';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

test('metaBrowser reads _fbp and _fbc, and builds fbc from an ad click when the cookie is missing', () => {
  const headers = new Headers({ cookie: 'a=1; _fbp=fb.1.1596403881668.1116446470; _fbc=fb.1.1554763741205.IwAR2F4-dbP0', 'cf-connecting-ip': '2001:db8::1', 'user-agent': 'Mozilla/5.0' });
  assert.deepEqual(metaBrowser('https://call4.me/account?session_id=cs_1', headers), {
    fbp: 'fb.1.1596403881668.1116446470',
    fbc: 'fb.1.1554763741205.IwAR2F4-dbP0',
    ip: '2001:db8::1',
    userAgent: 'Mozilla/5.0',
    url: 'https://call4.me/account',
  });
  // The click id keeps its case; the query string never reaches Meta.
  const clicked = metaBrowser('https://call4.me/?fbclid=IwAR2F4-AbC', new Headers({ cookie: '_fbp=garbage' }), 1_790_000_000_000);
  assert.equal(clicked.fbc, 'fb.1.1790000000000.IwAR2F4-AbC');
  assert.equal(clicked.fbp, null);
  assert.equal(clicked.url, 'https://call4.me/');
  // A cookie beats the query parameter.
  assert.equal(metaBrowser('https://call4.me/?fbclid=new', new Headers({ cookie: '_fbc=fb.1.1.old' })).fbc, 'fb.1.1.old');
  assert.deepEqual(metaBrowser('https://call4.me/', new Headers()), { fbp: null, fbc: null, ip: null, userAgent: null, url: 'https://call4.me/' });
});

/** Captures what would go to Meta. */
function captureFetch(): { bodies: Record<string, unknown>[]; urls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    urls.push(url);
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return { bodies, urls, restore: () => (globalThis.fetch = original) };
}

const browser = { fbp: 'fb.1.1596403881668.1116446470', fbc: null, ip: '203.0.113.7', userAgent: 'Mozilla/5.0', url: 'https://call4.me/welcome' };

test('sendMeta sends nothing without both the Pixel id and the token', async () => {
  const f = captureFetch();
  try {
    const opts = { user: { externalId: 'acct1' }, browser, events: [{ name: 'Purchase', id: 'cs_1' }] };
    await sendMeta({}, opts);
    await sendMeta({ META_PIXEL_ID: '123' }, opts);
    await sendMeta({ META_CAPI_TOKEN: 'tok' }, opts);
    assert.equal(f.bodies.length, 0);
  } finally {
    f.restore();
  }
});

test('sendMeta hashes the account id, sends only browser ids, and marks website events', async () => {
  const f = captureFetch();
  try {
    await sendMeta(
      { META_PIXEL_ID: '123', META_CAPI_TOKEN: 'tok' },
      { user: { externalId: 'acct1' }, browser, events: [{ name: 'Purchase', id: 'cs_1', customData: { currency: 'USD', value: 20 } }, { name: 'Purchase', id: 'in_1', actionSource: 'system_generated' }] },
    );
    assert.equal(f.urls[0], `https://graph.facebook.com/${GRAPH_API_VERSION}/123/events?access_token=tok`);
    const [checkout, reload] = f.bodies[0].data as Record<string, unknown>[];
    const userData = { external_id: [sha256('acct1')], fbp: browser.fbp, client_ip_address: '203.0.113.7', client_user_agent: 'Mozilla/5.0' };
    assert.equal(typeof checkout.event_time, 'number');
    assert.ok((checkout.event_time as number) < 1e11, 'event_time is in seconds');
    assert.deepEqual({ ...checkout, event_time: 0 }, {
      event_name: 'Purchase',
      event_time: 0,
      event_id: 'cs_1',
      action_source: 'website',
      event_source_url: 'https://call4.me/welcome',
      user_data: userData,
      custom_data: { currency: 'USD', value: 20 },
    });
    assert.equal(reload.action_source, 'system_generated');
    assert.equal(reload.event_source_url, undefined);
    assert.doesNotMatch(JSON.stringify(f.bodies[0]), /acct1|@/);
  } finally {
    f.restore();
  }
});

test('analytics: sign_up reaches Meta once as CompleteRegistration; calls carry no details', async () => {
  let claimed = false;
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        run: async () => {
          const won = sql.includes('ga_signup_at IS NULL') && !claimed;
          if (won) claimed = true;
          return { meta: { changes: won ? 1 : 0 } };
        },
        first: async () => ({ provider: 'google' }),
      }),
    }),
  } as unknown as D1Database;
  const account: Account = {
    id: 'acct1',
    email: 'a@example.com',
    display_name: 'Ada Lovelace',
    key_prefix: null,
    created_at: 1_790_000_000_000,
    ga_client_id: null,
    ga_signup_at: null,
    meta_fbp: 'fb.1.1596403881668.1116446470',
    meta_fbc: 'fb.1.1554763741205.IwAR2F4',
  };
  const f = captureFetch();
  try {
    // Meta alone: GA's secret is unset, so every request is Meta's.
    const a = analytics({ DB: db, META_PIXEL_ID: '123', META_CAPI_TOKEN: 'tok' });
    await a.purchase(account, { transactionId: 'cs_1', cents: 2000, reload: false });
    await a.track(account, [{ name: 'call_placed', params: { surface: 'mcp', category: 'dentist' } }]);
    await a.track(account, [{ name: 'call_ended', params: { status: 'completed' } }]);
    assert.equal(f.bodies.length, 2, 'call_ended is not sent to Meta');
    const events = f.bodies.map((b) => (b.data as Record<string, unknown>[]).map((e) => e.event_name));
    assert.deepEqual(events, [['CompleteRegistration', 'Purchase'], ['CallPlaced']]);
    const [signup, purchase] = f.bodies[0].data as Record<string, unknown>[];
    assert.notEqual(signup.event_id, purchase.event_id);
    assert.equal(purchase.event_id, 'cs_1');
    assert.deepEqual(purchase.custom_data, { currency: 'USD', value: 20 });
    // No browser was there: the account's stored ids stand in, and the event is not a website one.
    assert.deepEqual(purchase.user_data, { external_id: [sha256('acct1')], fbp: account.meta_fbp, fbc: account.meta_fbc });
    assert.equal(purchase.action_source, 'other');
    const call = (f.bodies[1].data as Record<string, unknown>[])[0];
    assert.equal(call.custom_data, undefined);
    assert.doesNotMatch(JSON.stringify(f.bodies), /dentist|example\.com|Ada|acct1/);
  } finally {
    f.restore();
  }
});
