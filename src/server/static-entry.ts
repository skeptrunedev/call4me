/** Small edge dispatcher. Public documents never initialize the application or read D1. */
import { canonicalRedirect } from './lib/canonical';
import { firstTouchCookie, firstTouchOf, firstTouchSetCookie } from './lib/first-touch';
import { prefersMarkdown } from './lib/markdown';
import { exampleAudio } from './lib/example-audio';
import { hasCredentials } from './lib/session-credentials';
import { redditCookies, redditVisitOf, saveRedditVisit } from './lib/reddit-visit';
import { STATIC_PAGES } from './static-manifest.generated';

/** Null delegates to the existing authenticated server. No response cache contains user data. */
export async function staticResponse(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const redirect = canonicalRedirect(url, env);
  if (redirect) return Response.redirect(redirect, 301);
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  if (url.pathname.startsWith('/__pages/')) return new Response('not found', { status: 404 });
  if (url.pathname === '/home') return Response.redirect(new URL('/' + url.search, url).href, 301);
  if (url.pathname.startsWith('/static/') || url.pathname === '/favicon.svg') {
    if (/^\/static\/(examples|blog|voices)\/[a-z0-9-]+\.mp3$/.test(url.pathname)) {
      const assetRequest = new Request(request, { method: 'GET' });
      assetRequest.headers.delete('range');
      assetRequest.headers.delete('if-range');
      return exampleAudio(request, await env.ASSETS.fetch(assetRequest));
    }
    return env.ASSETS.fetch(request);
  }
  if (url.pathname === '/mcp' && ((env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST && url.hostname !== 'localhost') || url.protocol !== 'https:' && url.hostname !== 'localhost' || hasCredentials(request.headers) || request.headers.has('mcp-protocol-version') || (request.headers.get('accept') ?? '').includes('text/event-stream'))) return null;
  // Search, ranking, validation messages and explicit live views retain existing server behavior.
  if (['q', 'subscribed', 'live'].some(key => url.searchParams.has(key))) return null;
  if (url.searchParams.has('tab') && url.searchParams.get('tab') !== 'latest') return null;
  let key = url.pathname;
  if (url.searchParams.has('page')) {
    const page = url.searchParams.get('page')!;
    if (key !== '/blog' || !/^[2-9]$|^[1-9][0-9]+$/.test(page)) return null;
    key += '?page=' + page;
  }
  const page = STATIC_PAGES[key];
  const feed = ['/blog/rss.xml', '/blog/feed.xml'].includes(url.pathname);
  if (!page && !feed) return null;
  const markdown = !feed && prefersMarkdown(request.headers.get('accept') ?? undefined);
  const assetUrl = new URL(feed ? url.pathname : markdown ? page.markdown : page.html, url);
  const headers = new Headers(request.headers);
  // The selected asset is shared public content, independent of cookies and authorization.
  headers.delete('cookie');
  headers.delete('authorization');
  const start = performance.now();
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method, headers }));
  if (asset.status !== 200 && asset.status !== 304) {
    console.error('missing prebuilt public document', key, asset.status);
    return new Response('This page could not be loaded. Please try again.', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  const response = new Response(request.method === 'HEAD' || asset.status === 304 ? null : asset.body, asset);
  response.headers.set('x-render-mode', 'static');
  response.headers.set('server-timing', `static;dur=${(performance.now() - start).toFixed(1)}`);
  response.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  response.headers.set('vary', 'Accept');
  response.headers.set('content-type', feed ? (url.pathname.endsWith('/rss.xml') ? 'application/rss+xml; charset=utf-8' : 'application/atom+xml; charset=utf-8') : markdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
  if (markdown) response.headers.set('x-markdown-tokens', String(page.tokens));
  if (key === '/') response.headers.set('link', '</.well-known/api-catalog>; rel="api-catalog"');
  if (request.method === 'GET' && !feed) {
    if (!firstTouchCookie(request.headers.get('cookie'))) {
      const touch = firstTouchOf(url, request.headers.get('referer') ?? undefined);
      if (touch) response.headers.append('set-cookie', firstTouchSetCookie(touch));
    }
    const visit = redditVisitOf(url, request.headers);
    if (visit) {
      // Only a paid landing needs a write. Finish it before issuing the identity cookie so
      // an immediate signup cannot race attribution. Ordinary navigation never reads D1.
      await saveRedditVisit(env.DB, visit);
      for (const cookie of redditCookies(visit)) response.headers.append('set-cookie', cookie);
    }
    if (response.headers.has('set-cookie')) response.headers.set('cache-control', 'private, no-store');
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const response = await staticResponse(request, env);
    if (response) return response;
    const { default: app } = await import('./index');
    return app.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    const { default: app } = await import('./index');
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env>;
