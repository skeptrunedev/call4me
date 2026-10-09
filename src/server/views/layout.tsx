import type { Child, FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { tryGetContext } from 'hono/context-storage';
import type { AppEnv } from '../lib/context';
import { GA_MEASUREMENT_ID } from '../lib/ga';
import type { RedditPixelEvent } from '../lib/reddit';
import { PAGES, SITE, SITE_TITLE, type PageKey, type PageOverride } from '../lib/pages';
import { OG_CARD_VERSION } from '../lib/og-card';
import { placedCallCount } from '../services/stats';

export { SITE_DESCRIPTION } from '../lib/pages';

/** Read fresh aggregate usage from the nearest D1 replica, like the blog's social counts. */
const CallCount: FC = () => {
  const ctx = tryGetContext<AppEnv>();
  // Standalone rendering (for previews and tests) has no database binding.
  return ctx ? renderCallCount(ctx.env.DB) : null;
};

async function renderCallCount(db: D1Database) {
  try {
    const count = await placedCallCount(db.withSession('first-unconstrained'));
    return <span> · {count.toLocaleString('en-US')} {count === 1 ? 'call' : 'calls'} placed</span>;
  } catch (error) {
    console.error('footer call count failed', error);
    return <span> · call count unavailable</span>;
  }
}

/** Copies the textarea that follows a `.copy-prompt` button: execCommand first (works on any real click), clipboard API second. */
const COPY_SCRIPT = `
(function () {
  var buttons = document.querySelectorAll('.copy-prompt');
  for (var i = 0; i < buttons.length; i++) bind(buttons[i]);
  function bind(b) {
    var t = document.getElementById(b.getAttribute('data-target'));
    if (!t) return;
    var idle = b.textContent;
    function done(ok) {
      b.textContent = ok ? '[ copied. paste it into your agent ]' : '[ could not copy: select the text below ]';
      if (!ok) { t.hidden = false; t.focus(); t.select(); }
      setTimeout(function () { b.textContent = idle; }, 3000);
    }
    b.addEventListener('click', function () {
      var ok = false, wasHidden = t.hidden;
      try { t.hidden = false; t.select(); ok = document.execCommand('copy'); t.hidden = wasHidden; window.getSelection().removeAllRanges(); } catch (e) { ok = false; t.hidden = wasHidden; }
      if (ok) return done(true);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  }
})();
`;

/**
 * Google Analytics 4 (lib/ga.ts). Signed in, visits carry the account id as user_id and the hashed
 * email as user-provided data, set ahead of config so every hit has it; the email itself never.
 */
const gaScript = (userId: string | null, emailHash: string | null) => `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());${emailHash ? `\ngtag('set', 'user_data', ${scriptValue({ sha256_email_address: emailHash })});` : ''}
gtag('config', '${GA_MEASUREMENT_ID}'${userId ? `, ${scriptValue({ user_id: userId })}` : ''});
`;

/** A value written into an inline script, unable to close the script tag. */
const scriptValue = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/**
 * Meta Pixel (lib/meta.ts), Meta's base code. Signed in, advanced matching passes the account id as
 * external_id, which the Pixel hashes before sending; nothing else about the person.
 */
const metaPixelScript = (pixelId: string, externalId: string | null) => `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${scriptValue(pixelId)}${externalId ? `, ${scriptValue({ external_id: externalId })}` : ''});
fbq('track', 'PageView');
`;

/** Reddit's base Pixel plus optional conversion events whose ids match CAPI for deduplication. */
const redditPixelScript = (pixelId: string, externalId: string | null, events: RedditPixelEvent[]) => `
!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement('script');t.src='https://www.redditstatic.com/ads/pixel.js';t.async=!0;var s=d.getElementsByTagName('script')[0];s.parentNode.insertBefore(t,s)}}(window,document);
rdt('init', ${scriptValue(pixelId)}${externalId ? `, ${scriptValue({ externalId })}` : ''});
rdt('track', 'PageVisit');
${events
  .map((event) => {
    const data = {
      conversionId: event.conversionId,
      ...(event.customEventName ? { customEventName: event.customEventName } : {}),
      ...(event.currency ? { currency: event.currency } : {}),
      ...(event.value !== undefined ? { value: event.value } : {}),
      ...(event.itemCount !== undefined ? { itemCount: event.itemCount } : {}),
    };
    return `rdt('track', ${scriptValue(event.name)}, ${scriptValue(data)});`;
  })
  .join('\n')}
`;

/**
 * WebMCP (webmachinelearning.github.io/webmcp): the site's key actions as in-page tools for
 * browser agents. Placing calls needs the MCP server (signed in); these read the site, hand
 * over the install prompt, and open pages or the add-funds checkout for the person at the keyboard.
 */
const WEBMCP_SCRIPT = `
(function () {
  var mc = (document.modelContext || navigator.modelContext); if (!mc || typeof mc.registerTool !== 'function') return;
  var PAGES = { home: '/', examples: '/examples', mcp: '/mcp', blog: '/blog', rules: '/rules', privacy: '/privacy', terms: '/terms', account: '/account' };
  var pageArg = { type: 'object', properties: { page: { type: 'string', enum: Object.keys(PAGES), description: 'home, examples (real calls), mcp (install), blog, rules, privacy, terms, or account (signed in)' } }, required: ['page'] };
  var tools = [
    { name: 'call4me_read_page', description: 'Read a call4me page as markdown: home (what call4me does and pricing), examples (real call excerpts and transcripts), mcp (how to install), blog (posts and the newsletter), rules, privacy, terms, or account (balance and calls; needs the person signed in).',
      inputSchema: pageArg,
      execute: function (a) { return fetch(PAGES[a.page] || '/', { headers: { accept: 'text/markdown' } }).then(function (r) { return r.text(); }); } },
    { name: 'call4me_get_install_prompt', description: 'The prompt that installs the call4me MCP server in Claude Code, Codex, Claude Desktop, claude.ai, ChatGPT, Muse, or Grok Bot and signs the person in (signing in with Google or X the first time is the sign-up); the agent then gets tools to place phone calls.',
      inputSchema: { type: 'object', properties: {} },
      execute: function () { return fetch('/mcp').then(function (r) { return r.text(); }).then(function (h) { var t = new DOMParser().parseFromString(h, 'text/html').getElementById('install-prompt'); return { prompt: t ? t.textContent : '' }; }); } },
    { name: 'call4me_open_page', description: 'Navigate this tab to a call4me page.', inputSchema: pageArg,
      execute: function (a) { location.href = PAGES[a.page] || '/'; return { ok: true }; } },
    { name: 'call4me_add_funds', description: 'Open the Stripe checkout for call4me credits in this tab ($10 units, the person picks how many; reloads monthly unless they untick it). Nothing is charged until the person pays on Stripe.',
      inputSchema: { type: 'object', properties: {} },
      execute: function () { var f = document.createElement('form'); f.method = 'post'; f.action = '/add-funds'; document.body.appendChild(f); f.submit(); return { ok: true }; } }
  ];
  for (var i = 0; i < tools.length; i++) { try { tools[i].annotations = { readOnlyHint: tools[i].name === 'call4me_read_page' || tools[i].name === 'call4me_get_install_prompt' }; var p = mc.registerTool(tools[i]); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
})();
`;

export const Layout: FC<{
  title?: string;
  signedIn?: boolean;
  /** Which page this is, for its social preview (lib/pages.ts). */
  page?: PageKey;
  /** Overrides the page's canonical path, for pages with an id in the URL. */
  path?: string;
  /** Overrides for pages whose preview depends on their content (blog posts). */
  meta?: PageOverride;
  /** Search/filter variants and other one-off pages should not compete with their canonical page. */
  noindex?: boolean;
  /** Browser events also sent by CAPI, with the same conversion ids. */
  redditEvents?: RedditPixelEvent[];
  children?: Child;
}> = ({ title, signedIn = false, page = 'message', path, meta: override, noindex = false, redditEvents = [], children }) => {
  const meta = PAGES[page];
  const fullTitle = title ? `${title} - call4me` : SITE_TITLE;
  const description = override?.description ?? meta.description;
  const url = `${SITE}${path ?? meta.path}`;
  const image = `${SITE}${override?.image ?? `/og/${meta.card}.png?v=${OG_CARD_VERSION}`}`;
  const alt = override?.imageAlt ?? `call4me: ${title ?? 'your AI agent makes phone calls for you'}`;
  const ctx = tryGetContext<AppEnv>();
  const accountId = ctx?.get('account')?.id ?? null;
  const pixelId = ctx?.env.META_PIXEL_ID;
  // Never give third-party browser code access to account pages, call transcripts/recordings,
  // admin pages, or public examples/blog posts that contain call content. CAPI covers later usage.
  const redditSafePath = ctx ? ['/', '/mcp', '/login', '/rules', '/privacy', '/terms', '/support', '/voices', '/welcome'].includes(new URL(ctx.req.url).pathname) : false;
  const redditPixelId = redditSafePath ? ctx?.env.REDDIT_PIXEL_ID : undefined;
  return (
  <>
    {raw('<!DOCTYPE html>')}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        {(noindex || ('noindex' in meta && meta.noindex)) && <meta name="robots" content="noindex,follow" />}
        <meta name="theme-color" content="#551a8b" />
        {ctx?.env.META_DOMAIN_VERIFICATION && <meta name="facebook-domain-verification" content={ctx.env.META_DOMAIN_VERIFICATION} />}
        <link rel="canonical" href={url} />
        <link rel="alternate" type="application/atom+xml" href="/blog/feed.xml" title="call4me blog" />
        <link rel="alternate" type="application/rss+xml" href="/blog/rss.xml" title="call4me blog RSS" />
        {override?.published && <meta property="article:published_time" content={override.published} />}
        {override?.modified && <meta property="article:modified_time" content={override.modified} />}
        {override?.type === 'article' && <meta property="article:author" content="https://x.com/skeptrune" />}
        {override?.jsonLd && <script type="application/ld+json">{raw(JSON.stringify(override.jsonLd).replace(/</g, '\\u003c'))}</script>}
        <link rel="ai-catalog" href="/.well-known/ai-catalog.json" type="application/ai-catalog+json" />
        <link rel="ard" href="/.well-known/ard.json" />
        <link rel="alternate" type="text/markdown" href={path ?? meta.path} title="markdown version (Accept: text/markdown)" />
        {/* Open Graph: Slack, Discord, Signal, iMessage, Facebook, LinkedIn read these. */}
        <meta property="og:site_name" content="call4me" />
        <meta property="og:type" content={override?.type ?? 'website'} />
        <meta property="og:locale" content="en_US" />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={image} />
        <meta property="og:image:secure_url" content={image} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={alt} />
        {/* X / Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@skeptrune" />
        <meta name="twitter:creator" content="@skeptrune" />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
        <meta name="twitter:image:alt" content={alt} />
        <link rel="stylesheet" href="/static/style.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script src="https://analytics.ahrefs.com/analytics.js" data-key="Sy+Jmk5GRDykk/0THUQjsg" async></script>
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}></script>
        <script>{raw(gaScript(accountId, ctx?.get('gaEmailHash') ?? null))}</script>
        {pixelId && <script>{raw(metaPixelScript(pixelId, accountId))}</script>}
        {redditPixelId && <script>{raw(redditPixelScript(redditPixelId, accountId, redditEvents))}</script>}
      </head>
      <body>
        {pixelId && (
          <noscript>
            <img height="1" width="1" style="display:none" alt="" src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`} />
          </noscript>
        )}
        <div id="masthead">
          <a class="logo" href="/">call4me</a>
          <span class="bc">your AI agent makes phone calls for you</span>
        </div>
        <div id="topnav">
          <a href="/">home</a>
          <a href="/examples">examples</a>
          {/* A form, not a link: it opens a Stripe checkout, which crawlers and link previews must not do. */}
          <form method="post" action="/add-funds" class="navform">
            <button type="submit" class="linkbutton">add funds</button>
          </form>
          <a href="/mcp">install mcp</a>
          <a href="/blog">blog</a>
          {signedIn ? <a href="/account">my account</a> : <a href="/login">sign up / sign in</a>}
          <a href="/rules">rules</a>
        </div>
        <hr />
        {children}
        <footer>
          <a href="/rules">rules</a>
          <a href="/privacy">privacy</a>
          <a href="/terms">terms</a>
          <a href="/support">support</a>
          <a href="/blog">blog</a>
          <a href="/companies">companies</a>
          <a href="/voices">voices</a>
          <a class="rss-link" href="/blog/rss.xml" type="application/rss+xml" aria-label="Subscribe to the RSS feed" title="RSS feed">
            <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
              <circle cx="5" cy="19" r="2" fill="currentColor" />
              <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </a>
          <span> · © call4me</span>
          <CallCount />
        </footer>
        <script>{raw(COPY_SCRIPT)}</script>
        <script>{raw(WEBMCP_SCRIPT)}</script>
      </body>
    </html>
  </>
  );
};

/** A button that copies `text`, with the text itself shown underneath for people who prefer to select it. */
export const CopyBlock: FC<{ id: string; text: string; label?: string; rows?: number; hidden?: boolean }> = ({ id, text, label = '[ copy prompt for your agent ]', rows = 14, hidden = false }) => (
  <div class="copyblock">
    <button type="button" class="linkbutton copy copy-prompt" data-target={id}>
      {label}
    </button>
    <textarea id={id} readonly rows={rows} hidden={hidden} aria-label="prompt for your agent">
      {text}
    </textarea>
  </div>
);
