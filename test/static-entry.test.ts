import assert from 'node:assert/strict';
import test from 'node:test';
import { staticResponse } from '../src/server/static-entry';
import { STATIC_PAGES } from '../src/server/static-manifest.generated';
import { encodeFirstTouch, firstTouchCookie } from '../src/server/lib/first-touch';

const origin = 'https://call4.me';
const firstTouch = { source: 'google', medium: 'organic', campaign: null, landing: '/examples', at: 1234 };
const returningCookie = `c4_ft=${encodeFirstTouch(firstTouch)}`;

/** A database access is a failure: ordinary public documents must only use the asset binding. */
function harness(reply: (request: Request) => Response | Promise<Response> = () => new Response('public document', {
  headers: { etag: '"build-42"', 'content-type': 'application/octet-stream', 'cf-cache-status': 'HIT' },
})) {
  const requests: Request[] = [];
  const env = {
    CANONICAL_HOST: 'call4.me',
    LEGACY_HOSTS: 'callbay.skeptrune.com',
    get DB(): never { throw new Error('Public rendering touched D1'); },
    ASSETS: { fetch(request: Request) { requests.push(request); return reply(request); } },
  } as unknown as Env;
  return { env, requests, respond: (path: string, init?: RequestInit) => staticResponse(new Request(new URL(path, origin), init), env) };
}

test('every manifest document is served without application initialization or database reads', async () => {
  const h = harness();
  for (const [path, page] of Object.entries(STATIC_PAGES)) {
    const response = await h.respond(path, { headers: { cookie: returningCookie } });
    assert.ok(response, path);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), 'public document', path);
    assert.equal(new URL(h.requests.at(-1)!.url).pathname, page.html, path);
    assert.equal(response.headers.get('x-render-mode'), 'static', path);
    assert.match(response.headers.get('server-timing')!, /^static;dur=\d+(\.\d+)?$/);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.equal(response.headers.get('cf-cache-status'), 'HIT');
    assert.equal(response.headers.get('etag'), '"build-42"');
  }
});

test('public assets never receive browser credentials or campaign query strings', async () => {
  const h = harness();
  const request = new Request(origin + '/examples?utm_source=google&utm_campaign=spring', {
    headers: { cookie: `${returningCookie}; callbay.session_token=secret`, authorization: 'Bearer private-key', accept: 'text/html', 'if-none-match': '"build-41"' },
  });
  const response = await staticResponse(request, h.env);
  assert.ok(response);
  const asset = h.requests[0]!;
  assert.equal(new URL(asset.url).search, '');
  assert.equal(asset.headers.get('cookie'), null);
  assert.equal(asset.headers.get('authorization'), null);
  assert.equal(asset.headers.get('if-none-match'), '"build-41"');
  assert.equal(request.headers.get('authorization'), 'Bearer private-key', 'the original request remains available to its caller');
  assert.equal(response.headers.get('set-cookie'), null);
});

test('HTML and Markdown negotiation use separate generated assets with Vary on both', async () => {
  for (const [accept, markdown] of [
    ['text/markdown', true],
    ['text/markdown;q=0.8,text/html;q=0.2', true],
    ['text/markdown;q=0.2,text/html;q=0.8', false],
    ['text/markdown;q=0,text/html', false],
    ['text/html', false],
    ['*/*', false],
  ] as const) {
    const h = harness();
    const response = await h.respond('/examples', { headers: { accept, cookie: returningCookie } });
    assert.ok(response);
    const page = STATIC_PAGES['/examples']!;
    assert.equal(new URL(h.requests[0]!.url).pathname, markdown ? page.markdown : page.html);
    assert.equal(response.headers.get('content-type'), markdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
    assert.equal(response.headers.get('vary'), 'Accept');
    assert.equal(response.headers.get('x-markdown-tokens'), markdown ? String(page.tokens) : null);
  }
  const root = await harness().respond('/', { headers: { cookie: returningCookie } });
  assert.match(root!.headers.get('link')!, /<\/\.well-known\/api-catalog>; rel="api-catalog"/);
});

test('HEAD and conditional 304 preserve validators and never send a document body', async () => {
  const h = harness(() => new Response('body that must be suppressed', { headers: { etag: '"build-42"', 'content-length': '28' } }));
  const head = await h.respond('/examples', { method: 'HEAD' });
  assert.ok(head);
  assert.equal(h.requests[0]!.method, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), '28');
  assert.equal(head.headers.get('set-cookie'), null);

  const conditional = harness(request => {
    assert.equal(request.headers.get('if-none-match'), '"build-42"');
    return new Response(null, { status: 304, headers: { etag: '"build-42"' } });
  });
  const response = await conditional.respond('/examples', { headers: { 'if-none-match': '"build-42"', cookie: returningCookie } });
  assert.equal(response!.status, 304);
  assert.equal(await response!.text(), '');
  assert.equal(response!.headers.get('etag'), '"build-42"');
  assert.equal(response!.headers.get('vary'), 'Accept');
});

test('first touch is recorded per response while returning visitors reuse the shared asset', async () => {
  const asset = new Response('page', { headers: { etag: '"shared"' } });
  const h = harness(() => asset.clone());
  const response = await h.respond('/examples?utm_source=google&utm_medium=cpc&utm_campaign=spring');
  assert.ok(response);
  const cookie = response.headers.get('set-cookie')!;
  const touch = firstTouchCookie(cookie);
  assert.equal(touch?.source, 'google');
  assert.equal(touch?.medium, 'cpc');
  assert.equal(touch?.campaign, 'spring');
  assert.equal(touch?.landing, '/examples');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(asset.headers.get('set-cookie'), null, 'never mutate the shared asset');
  const returning = await h.respond('/examples', { headers: { cookie: returningCookie } });
  assert.equal(returning!.headers.get('set-cookie'), null);
  assert.equal(returning!.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  const internal = await h.respond('/examples', { headers: { referer: origin + '/blog' } });
  assert.equal(internal!.headers.get('set-cookie'), null);
});

test('invalid first touch cookies are replaced without reading D1', async () => {
  const response = await harness().respond('/examples', { headers: { cookie: 'c4_ft=%not-json' } });
  assert.equal(firstTouchCookie(response!.headers.get('set-cookie'))?.landing, '/examples');
  assert.equal(response!.headers.get('cache-control'), 'private, no-store');
});

test('dynamic query variants cannot be mistaken for their base static page', async () => {
  const h = harness();
  for (const path of ['/blog?q=phone', '/blog?q=', '/blog?tab=top', '/blog?tab=invalid', '/blog?subscribed=sent', '/blog?live', '/?live=1', '/blog?page=1', '/blog?page=0', '/blog?page=02', '/blog?page=-2', '/blog?page=2.5', '/blog?page=999999', '/examples?page=2']) {
    assert.equal(await h.respond(path), null, path);
  }
  assert.equal(h.requests.length, 0);
  const latest = await h.respond('/blog?tab=latest', { headers: { cookie: returningCookie } });
  assert.ok(latest);
  assert.equal(new URL(h.requests[0]!.url).pathname, STATIC_PAGES['/blog']!.html);
  const next = await h.respond('/blog?page=2&tab=latest&utm_source=google', { headers: { cookie: returningCookie } });
  assert.ok(next);
  assert.equal(new URL(h.requests[1]!.url).pathname, STATIC_PAGES['/blog?page=2']!.html);
});

test('MCP protocol requests and authenticated installation stay on the dynamic server', async () => {
  const h = harness();
  for (const headers of [
    { 'mcp-protocol-version': '2024-11-05' },
    { accept: 'text/event-stream' },
    { accept: 'text/html, text/event-stream' },
    { authorization: 'Bearer private-key' },
    { cookie: 'callbay.session_token=private-session' },
    { cookie: '__Secure-callbay.session_token=private-session' },
    { cookie: 'unrelated=ok; callbay.session_token=private-session' },
  ]) assert.equal(await h.respond('/mcp', { headers }), null, JSON.stringify(headers));
  for (const path of ['/mcp/private-key', '/chatgpt/mcp', '/claude/mcp']) assert.equal(await h.respond(path), null, path);
  assert.equal(h.requests.length, 0);
  const publicPage = await h.respond('/mcp', { headers: { accept: 'text/html', cookie: returningCookie } });
  assert.ok(publicPage);
  assert.equal(new URL(h.requests[0]!.url).pathname, STATIC_PAGES['/mcp']!.html);
});

test('MCP install pages keep the actual legacy or HTTP origin for existing OAuth clients', async () => {
  const h = harness();
  for (const url of ['https://callbay.skeptrune.com/mcp', 'http://callbay.skeptrune.com/mcp', 'http://call4.me/mcp']) {
    assert.equal(await h.respond(url, { headers: { accept: 'text/html' } }), null, url);
  }
  assert.equal(h.requests.length, 0);
});

test('writes, accounts, payment completion, subscription tokens, and unpublished posts never serve generated pages', async () => {
  const h = harness();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    for (const path of ['/', '/mcp', '/buy', '/add-funds', '/blog/example/like', '/blog/example/comments']) {
      assert.equal(await h.respond(path, { method }), null, `${method} ${path}`);
    }
  }
  for (const path of ['/account', '/account/calls/call_secret', '/welcome?session_id=secret', '/login', '/oauth/consent', '/admin', '/blog/support', '/blog/subscribe/confirm?token=secret', '/blog/unsubscribe?token=secret', '/blog/not-published', '/api/auth/get-session']) {
    assert.equal(await h.respond(path), null, path);
    assert.equal(Object.hasOwn(STATIC_PAGES, new URL(path, origin).pathname), false, path);
  }
  assert.equal(h.requests.length, 0);
});

test('canonical redirects preserve public queries without redirecting legacy machine endpoints', async () => {
  const h = harness();
  for (const [from, to] of [
    ['http://call4.me/examples?utm_source=google', origin + '/examples?utm_source=google'],
    ['https://www.call4.me/blog?page=2', origin + '/blog?page=2'],
    ['https://callbay.skeptrune.com/examples', origin + '/examples'],
    ['https://www.call4.me/home?ref=x', origin + '/?ref=x'],
    ['/home?ref=x', origin + '/?ref=x'],
  ]) {
    const response = await h.respond(from!);
    assert.equal(response!.status, 301, from);
    assert.equal(response!.headers.get('location'), to, from);
  }
  assert.equal(await h.respond('https://callbay.skeptrune.com/mcp', { headers: { 'mcp-protocol-version': '2024-11-05' } }), null);
  assert.equal(await h.respond('https://callbay.skeptrune.com/webhooks/telnyx', { method: 'POST' }), null);
  assert.equal(h.requests.length, 0);
});

test('generated storage paths are not directly browsable', async () => {
  const h = harness();
  for (const method of ['GET', 'HEAD']) {
    const response = await h.respond(STATIC_PAGES['/']!.html, { method });
    assert.equal(response!.status, 404);
  }
  assert.equal(h.requests.length, 0);
});

test('RSS and Atom stay XML even when the client requests Markdown and never set page cookies', async () => {
  const h = harness();
  for (const [path, contentType] of [['/blog/rss.xml', 'application/rss+xml'], ['/blog/feed.xml', 'application/atom+xml']]) {
    const response = await h.respond(path!, { headers: { accept: 'text/markdown' } });
    assert.ok(response);
    assert.equal(new URL(h.requests.at(-1)!.url).pathname, path);
    assert.equal(response.headers.get('content-type'), contentType + '; charset=utf-8');
    assert.equal(response.headers.get('x-markdown-tokens'), null);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('missing or redirected generated artifacts fail explicitly instead of rendering an empty page', async t => {
  t.mock.method(console, 'error', () => undefined);
  for (const status of [404, 500, 307]) {
    const h = harness(() => new Response('missing', { status }));
    const response = await h.respond('/examples');
    assert.equal(response!.status, 503);
    assert.equal(response!.headers.get('cache-control'), 'no-store');
    assert.match(await response!.text(), /could not be loaded/);
    assert.equal(h.requests.length, 1);
  }
});

test('ordinary assets forward conditional requests untouched', async () => {
  const asset = new Response(null, { status: 304, headers: { etag: '"css-v2"' } });
  const h = harness(() => asset);
  const response = await h.respond('/static/style.css', { headers: { 'if-none-match': '"css-v2"' } });
  assert.equal(response, asset);
  assert.equal(h.requests[0]!.headers.get('if-none-match'), '"css-v2"');
  assert.equal(response!.headers.get('x-render-mode'), null);
});

test('audio ranges still work when ASSETS only returns complete files', async () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
  const h = harness(request => {
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.get('range'), null);
    assert.equal(request.headers.get('if-range'), null);
    return new Response(bytes, { headers: { 'content-type': 'audio/mpeg', etag: '"audio"' } });
  });
  for (const directory of ['examples', 'blog', 'voices']) {
    const path = `/static/${directory}/sample-call.mp3`;
    const response = await h.respond(path, { headers: { range: 'bytes=1-3', 'if-range': '"audio"' } });
    assert.equal(response!.status, 206);
    assert.equal(response!.headers.get('content-range'), 'bytes 1-3/6');
    assert.deepEqual([...new Uint8Array(await response!.arrayBuffer())], [1, 2, 3]);
    const head = await h.respond(path, { method: 'HEAD' });
    assert.equal(head!.status, 200);
    assert.equal(await head!.text(), '');
    assert.equal(head!.headers.get('content-length'), '6');
  }
  const invalid = await h.respond('/static/examples/sample-call.mp3', { headers: { range: 'bytes=10-' } });
  assert.equal(invalid!.status, 416);
  assert.equal(invalid!.headers.get('content-range'), 'bytes */6');
});

test('paid Reddit attribution is saved before its visit identity is issued', async () => {
  let releaseWrite!: () => void;
  let enteredWrite!: () => void;
  const writePending = new Promise<void>(resolve => { releaseWrite = resolve; });
  const writeStarted = new Promise<void>(resolve => { enteredWrite = resolve; });
  let values: unknown[] = [];
  const env = {
    CANONICAL_HOST: 'call4.me', LEGACY_HOSTS: '',
    ASSETS: { fetch: async () => new Response('public document') },
    DB: {
      prepare(sql: string) {
        assert.match(sql, /^INSERT INTO reddit_visits/);
        return {
          bind(...bound: unknown[]) {
            values = bound;
            return { async run() { enteredWrite(); await writePending; return { success: true }; } };
          },
        };
      },
    },
  } as unknown as Env;
  let settled = false;
  const pending = staticResponse(new Request(origin + '/?rdt_cid=approved-click&utm_source=reddit&utm_medium=paid', {
    headers: { cookie: returningCookie, 'user-agent': 'static-router-test' },
  }), env).then(response => { settled = true; return response; });
  await writeStarted;
  assert.equal(settled, false, 'the visitor cookie cannot race its database row');
  assert.equal(values[3], 'approved-click');
  assert.equal(values[13], '/');
  releaseWrite();
  const response = await pending;
  assert.ok(response);
  assert.match(response.headers.get('set-cookie')!, /c4_rv=/);
  assert.match(response.headers.get('set-cookie')!, new RegExp(`c4_rvisit=${values[0]}`));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
