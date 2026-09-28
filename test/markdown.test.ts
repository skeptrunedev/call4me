import { describe, expect, it } from 'vitest';
import { approxTokens, htmlToMarkdown, prefersMarkdown } from '../src/server/lib/markdown';

const PAGE = `<!DOCTYPE html><html><head><title>install mcp - callbay</title><script>var x=1</script></head>
<body><div id="masthead"><a class="logo" href="/">callbay</a></div><div id="topnav"><a href="/">home</a><form method="post" action="/add-funds"><button type="submit">add funds</button></form></div><hr/>
<h1>Install callbay</h1>
<p>Calls cost <span class="price">$0.25/min</span> of talk time &amp; <b>unanswered calls</b> are free, see <a href="/rules">rules</a>.</p>
<h2>the prompt</h2>
<div class="copyblock"><button type="button" class="copy-prompt">[ copy prompt for your agent ]</button><textarea id="install-prompt" readonly rows="12">Set up callbay
  claude mcp add callbay https://call4.me/mcp</textarea></div>
<div class="copyblock"><button type="button">[ copy ]</button><textarea id="agent-prompt" readonly hidden>secret prompt</textarea></div>
<table><tr><th>when</th><th>cost</th></tr><tr><td><code>call_ab12</code></td><td>$1.25</td></tr></table>
<ul><li>one</li><li>two <a href="https://x.com/skeptrune">@skeptrune</a></li></ul>
<footer><a href="/terms">terms</a></footer><script>bad()</script></body></html>`;

describe('htmlToMarkdown', () => {
  const md = htmlToMarkdown(PAGE, 'https://call4.me/mcp');
  it('keeps the content and drops the chrome, forms, scripts, and hidden prompts', () => {
    expect(md).toContain('# Install callbay');
    expect(md).not.toContain('secret prompt');
    expect(md).not.toContain('add funds');
    expect(md).not.toContain('copy prompt');
    expect(md).not.toContain('bad()');
    expect(md).not.toContain('terms');
  });
  it('keeps a visible prompt textarea verbatim as a fenced block', () => {
    expect(md).toContain('```\nSet up callbay\n  claude mcp add callbay https://call4.me/mcp\n```');
  });
  it('renders links absolute, inline marks, code, and headings', () => {
    expect(md).toContain('[rules](https://call4.me/rules)');
    expect(md).toContain('**unanswered calls**');
    expect(md).toContain('$0.25/min');
    expect(md).toContain('## the prompt');
    expect(md).toContain('[@skeptrune](https://x.com/skeptrune)');
  });
  it('renders tables and lists', () => {
    expect(md).toContain('| when | cost |\n| --- | --- |\n| `call_ab12` | $1.25 |');
    expect(md).toContain('- one\n\n- two');
  });
  it('falls back to the title when the body has no h1', () => {
    expect(htmlToMarkdown('<html><head><title>rules - callbay</title></head><body><p>hi</p></body></html>', 'https://call4.me/rules')).toBe('# rules - callbay\n\nhi\n');
  });
});

describe('prefersMarkdown', () => {
  it('honours q-values and defaults', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true);
    expect(prefersMarkdown('text/markdown, text/html;q=0.9')).toBe(true);
    expect(prefersMarkdown('text/html, text/markdown;q=0.5')).toBe(false);
    expect(prefersMarkdown('text/html,application/xhtml+xml,*/*;q=0.8')).toBe(false);
    expect(prefersMarkdown(undefined)).toBe(false);
    expect(prefersMarkdown('text/markdown;q=0')).toBe(false);
  });
  it('estimates tokens', () => {
    expect(approxTokens('abcdefgh')).toBe(2);
  });
});
