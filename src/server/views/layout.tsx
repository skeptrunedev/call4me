import type { Child, FC } from 'hono/jsx';
import { raw } from 'hono/html';

export const SITE_DESCRIPTION = 'your AI agent makes phone calls for you. book dinners, doctor appointments, call dealerships. one prompt to install, prepaid credits from $10.';

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

export const Layout: FC<{ title?: string; signedIn?: boolean; children?: Child }> = ({ title, signedIn = false, children }) => (
  <>
    {raw('<!DOCTYPE html>')}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} - callbay` : 'callbay: your AI agent makes phone calls for you'}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta name="theme-color" content="#551a8b" />
        <meta property="og:site_name" content="callbay" />
        <meta property="og:title" content={title ? `${title} - callbay` : 'callbay'} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
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
