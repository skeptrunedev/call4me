import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { COMPANIES } from '../src/content/companies';
import { HOLD_DATA_PATH, HOLD_EVIDENCE, HOLD_LICENSE, HOLD_PATH, HOLD_SOURCE_POST, HOLD_TIMES, HOLD_UPDATED, holdCsv, holdDataset, holdSummary } from '../src/content/hold-times';
import { llmsTxt, sitemapEntries } from '../src/server/lib/discovery';
import { PAGES } from '../src/server/lib/pages';
import { HoldTimesPage } from '../src/server/views/hold-times';

const origin = 'https://call4.me';
const file = (path: string) => new URL(`../${path}`, import.meta.url);
const blogIndex = readFileSync(file('src/content/blog/index.ts'), 'utf8');
const post = (slug: string) => readFileSync(file(`src/content/blog/${slug}.md`), 'utf8');
const plain = (markdown: string) => markdown.replaceAll('**', '');
const html = () => String(HoldTimesPage({ signedIn: false }));

test('every row cites a published post, and its quotes appear verbatim in the source', () => {
  assert.equal(HOLD_TIMES.length, COMPANIES.length, 'one row per company on the /companies hub');
  assert.deepEqual(Object.keys(HOLD_EVIDENCE).sort(), COMPANIES.map(c => c.slug).sort(), 'no stray or missing evidence');
  const table = post(HOLD_SOURCE_POST).split('\n').filter(line => line.startsWith('| ['));
  for (const row of HOLD_TIMES) {
    assert.ok(existsSync(file(`src/content/blog/${row.slug}.md`)), `${row.slug}: source post exists`);
    assert.ok(blogIndex.includes(`slug: '${row.slug}'`), `${row.slug}: source post is published`);
    assert.equal(row.source, `${origin}/blog/${row.slug}`);
    assert.ok(plain(post(row.slug)).includes(row.evidence), `${row.slug}: evidence must be quoted verbatim from the post`);
    const line = table.find(l => l.includes(`(/blog/${row.slug})`));
    assert.ok(line?.split('|').map(cell => cell.trim()).includes(row.path), `${row.slug}: path must match the data post's table`);
    if (row.timeToHuman) assert.ok(row.evidence.startsWith(`${row.timeToHuman} `), `${row.slug}: evidence is the transcript line at ${row.timeToHuman}`);
  }
  assert.ok(blogIndex.includes(`slug: '${HOLD_SOURCE_POST}'`));
});

test('times, numbers and first answers match the tested /companies data, and the ranking follows the times', () => {
  for (const row of HOLD_TIMES) {
    const company = COMPANIES.find(c => c.slug === row.slug)!;
    assert.equal(row.timeToHuman, company.timeToHuman);
    assert.equal(row.number, company.number);
    assert.equal(row.called, company.called);
    assert.equal(row.firstAnswer, company.aiFirst === null ? 'not stated' : company.aiFirst ? 'AI or virtual assistant' : 'phone menu');
    assert.equal(row.rank === null, row.timeToHuman === null, `${row.slug}: only measured rows are ranked`);
  }
  const ranked = HOLD_TIMES.filter(r => r.rank !== null);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1]!.seconds! >= ranked[i]!.seconds!, 'longest first');
    assert.equal(ranked[i]!.rank, ranked[i]!.seconds === ranked[i - 1]!.seconds ? ranked[i - 1]!.rank : i + 1, 'ties share a rank');
  }
  const summary = holdSummary();
  assert.equal(summary.longest, ranked[0]);
  assert.equal(summary.shortest, ranked[ranked.length - 1]);
  for (const text of [PAGES.holdTimes.description, html()]) {
    assert.ok(text.includes(`${summary.longest.company} at ${summary.longest.timeToHuman}`), 'headline names the longest hold');
    assert.ok(text.includes(`${summary.companies} companies`));
  }
});

test('the dataset downloads and structured data describe the same rows', () => {
  const dataset = JSON.parse(JSON.stringify(holdDataset()));
  assert.equal(dataset.url, origin + HOLD_PATH);
  assert.equal(dataset.license, HOLD_LICENSE);
  assert.deepEqual(dataset.companies, JSON.parse(JSON.stringify(HOLD_TIMES)));
  const lines = holdCsv().trimEnd().split('\r\n');
  assert.equal(lines.length, HOLD_TIMES.length + 1);
  const page = html();
  const graph = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!)['@graph'];
  const node = graph.find((n: { '@type': string }) => n['@type'] === 'Dataset');
  assert.equal(graph.find((n: { '@type': string }) => n['@type'] === 'WebPage').mainEntity['@id'], node['@id']);
  assert.deepEqual(node.distribution.map((d: { contentUrl: string }) => d.contentUrl), [`${origin}${HOLD_DATA_PATH}.csv`, `${origin}${HOLD_DATA_PATH}.json`]);
  const list = graph.find((n: { '@type': string }) => n['@type'] === 'ItemList');
  assert.equal(list.numberOfItems, HOLD_TIMES.filter(r => r.rank !== null).length);
  for (const item of list.itemListElement) assert.ok(page.includes(`id="${new URL(item.url).hash.slice(1)}"`));
  assert.doesNotMatch(page, /FAQPage/);
  assert.doesNotMatch(page, /—/, 'no em dashes');
});

test('the page is server rendered, linked and discoverable', () => {
  const page = html();
  assert.ok(page.includes(`<link rel="canonical" href="${origin}${HOLD_PATH}"`));
  assert.doesNotMatch(page, /<meta name="robots" content="[^"]*noindex/);
  for (const row of HOLD_TIMES) {
    assert.ok(page.includes(`href="/blog/${row.slug}"`), `${row.slug} links its source`);
  }
  assert.ok(page.includes(`datetime="${HOLD_UPDATED}"`), 'dated last updated line');
  assert.ok(page.includes('href="/hold-times"'), 'footer link');
  assert.equal(sitemapEntries(origin).find(e => e.loc === origin + HOLD_PATH)?.lastmod, HOLD_UPDATED);
  const llms = llmsTxt(origin, 25);
  for (const path of [HOLD_PATH, `${HOLD_DATA_PATH}.csv`, `${HOLD_DATA_PATH}.json`]) assert.ok(llms.includes(origin + path));
  assert.ok(post(HOLD_SOURCE_POST).includes('](/hold-times)'), 'the data post links the page');
  assert.ok(readFileSync(file('src/server/views/companies.tsx'), 'utf8').includes('href="/hold-times"'), 'the companies hub links the page');
});
