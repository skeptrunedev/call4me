import type { Child, FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { PAGES, SITE, type PageKey } from '../lib/pages';

export { SITE_DESCRIPTION } from '../lib/pages';

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

export const Layout: FC<{
  title?: string;
  signedIn?: boolean;
  /** Which page this is, for its social preview (lib/pages.ts). */
  page?: PageKey;
  /** Overrides the page's canonical path, for pages with an id in the URL. */
  path?: string;
  children?: Child;
}> = ({ title, signedIn = false, page = 'message', path, children }) => {
  const meta = PAGES[page];
  const fullTitle = title ? `${title} - callbay` : 'callbay: your AI agent makes phone calls for you';
  const url = `${SITE}${path ?? meta.path}`;
  const image = `${SITE}/og/${meta.card}.png`;
  const alt = `callbay: ${title ?? 'your AI agent makes phone calls for you'}`;
  return (
  <>
    {raw('<!DOCTYPE html>')}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        <meta name="description" content={meta.description} />
        <meta name="theme-color" content="#551a8b" />
        <link rel="canonical" href={url} />
        {/* Open Graph: Slack, Discord, Signal, iMessage, Facebook, LinkedIn read these. */}
        <meta property="og:site_name" content="callbay" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={meta.description} />
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
        <meta name="twitter:description" content={meta.description} />
        <meta name="twitter:image" content={image} />
        <meta name="twitter:image:alt" content={alt} />
        <link rel="stylesheet" href="/static/style.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <div id="masthead">
          <a class="logo" href="/">callbay</a>
          <span class="bc">your AI agent makes phone calls for you</span>
        </div>
        <div id="topnav">
          <a href="/">home</a>
          <a href="/#buy">add funds</a>
          <a href="/mcp">install mcp</a>
          {signedIn ? <a href="/account">my account</a> : <a href="/login">sign in</a>}
          <a href="/rules">rules</a>
        </div>
        <hr />
        {children}
        <footer>
          <a href="/rules">rules</a>
          <a href="/privacy">privacy</a>
          <a href="/terms">terms</a>
          <span> · © callbay</span>
        </footer>
        <script>{raw(COPY_SCRIPT)}</script>
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
