import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPost } from '../src/server/lib/blog';
import { htmlToReadableText } from '../src/server/lib/markdown';

const prose = 'Read the guide carefully. '.repeat(220);
const post = (body: string, paid = false) => renderPost({
  slug: 'reading-time-test',
  markdown: `---\ntitle: Reading time\nsubtitle: A guide with evidence\ndate: 2026-10-07\npaid: ${paid}\n---\n${body}`,
});

test('optional transcripts do not inflate the guide reading time or disappear from the post', () => {
  const body = `${prose}\n\n<details>\n<summary>Read the full transcript</summary>\n\n${prose.repeat(10)}\n\n<details><summary>Nested evidence</summary>${prose}</details>\n</details>\n\nEnd of guide.`;
  const rendered = post(body);
  assert.equal(rendered.readingMinutes, post(`${prose}\n\nEnd of guide.`).readingMinutes);
  assert.match(rendered.html, /Read the full transcript/);
  assert.match(rendered.html, /Nested evidence/);
  assert.equal(rendered.body, body);
  assert.equal(post(`${prose}\n\n<details open><summary>Visible evidence</summary>${prose}</details>`).readingMinutes, 8);
});

test('reading time reflects rendered prose rather than HTML attributes and Markdown syntax', () => {
  const decorated = Array.from({ length: 220 }, () => '## [Read **the** guide carefully.](https://example.com "A long link title is metadata and should not add reading time")').join('\n\n');
  assert.equal(post(decorated).readingMinutes, 4);
  assert.equal(post(decorated).readingMinutes, post(prose).readingMinutes);
  assert.equal(htmlToReadableText('<p>hel<strong>lo</strong> &amp; goodbye</p><p>next&#32;paragraph</p><!-- hidden comment --><script>hidden script</script><span hidden>hidden text</span><audio controls><a href="call.mp3">fallback audio link</a></audio>'), 'hello & goodbye next paragraph');
});

test('the full paid guide counts while an empty guide keeps the minimum reading time', () => {
  assert.equal(post(`${prose}\n\n<!-- paywall -->\n\n${prose}`, true).readingMinutes, 8);
  assert.equal(post('').readingMinutes, 1);
  assert.equal(post('<details><summary>Transcript</summary>Only optional evidence.</details>').readingMinutes, 1);
});
