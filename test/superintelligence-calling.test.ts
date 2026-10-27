import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { SI_CALLING, SI_DATA_PATH, SI_LICENSE, SI_PATH, SI_UPDATED, siCsv, siDataset } from '../src/content/superintelligence-calling';
import { renderPost } from '../src/server/lib/blog';
import { llmsTxt, sitemapEntries } from '../src/server/lib/discovery';
import { SuperintelligenceCallingPage } from '../src/server/views/superintelligence-calling';

const origin = 'https://call4.me';
const html = () => String(SuperintelligenceCallingPage({ signedIn: false }));
const file = (path: string) => new URL(`../${path}`, import.meta.url);

// Read quoted CSV as a consumer would, including commas, newlines and doubled quotes.
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if (char === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  assert.equal(quoted, false, 'CSV must not end inside a quoted field');
  assert.equal(field, '', 'CSV must terminate its final row');
  return rows;
}

test('JSON and CSV preserve evidence and its limitations for every configuration', () => {
  const dataset = JSON.parse(JSON.stringify(siDataset()));
  assert.equal(dataset.url, `${origin}${SI_PATH}`);
  assert.equal(dataset.license, SI_LICENSE);
  assert.match(dataset.licenseScope, /recordings.*retain their own rights/);
  assert.deepEqual(dataset.configurations, SI_CALLING);
  const [columns, ...rows] = parseCsv(siCsv());
  assert.ok(columns);
  assert.equal(rows.length, dataset.configurations.length);
  const exported = rows.map(row => {
    assert.equal(row.length, columns.length, 'A comma or newline must not split a field');
    return Object.fromEntries(columns.map((column, i) => [column, row[i]]));
  });
  assert.equal(new Set(exported.map(row => row.id)).size, SI_CALLING.length);
  for (const evidence of dataset.configurations) {
    const row = exported.find(row => row.id === evidence.id)!;
    assert.ok(row, evidence.id);
    for (const key of ['assistant', 'configuration', 'route', 'connection', 'evidence', 'checked', 'finding', 'limitation', 'availability']) {
      assert.equal(row[key], evidence[key], `${evidence.id}: ${key}`);
    }
    assert.equal(row.evidence_date, evidence.evidenceDate ?? '');
    assert.deepEqual(row.source_urls!.split(' | '), evidence.sources.map((source: { url: string }) => source.url));
    assert.equal(row.recording_url, evidence.recording ? origin + evidence.recording : '');
  }
});

test('recorded evidence has actual local audio and reachable local citations and guides', () => {
  const blogIndex = readFileSync(file('src/content/blog/index.ts'), 'utf8');
  for (const evidence of SI_CALLING) {
    assert.ok(evidence.sources.length > 0, `${evidence.id} needs evidence`);
    if (evidence.evidence === 'recorded') {
      assert.ok(evidence.recording, `${evidence.id} needs an audio artifact`);
      assert.ok(evidence.evidenceDate, `${evidence.id} needs an execution date`);
      assert.ok(statSync(file(`public${evidence.recording}`)).size > 1_000);
    }
    for (const href of [...evidence.sources.map(source => source.url), ...(evidence.guide ? [evidence.guide] : [])]) {
      const url = new URL(href, origin);
      assert.equal(url.protocol, 'https:');
      if (url.origin !== origin) continue;
      if (url.pathname.startsWith('/blog/')) {
        const slug = url.pathname.slice('/blog/'.length);
        const markdown = readFileSync(file(`src/content/blog/${slug}.md`), 'utf8');
        assert.ok(blogIndex.includes(`slug: '${slug}'`), `${slug} must be published`);
        if (url.hash) {
          const post = renderPost({ slug, markdown });
          assert.ok(post.html.includes(`id="${url.hash.slice(1)}"`), `${href} must reach a real transcript section`);
        }
      } else {
        assert.ok(url.pathname.startsWith('/static/'), `Unexpected local evidence location: ${href}`);
        assert.ok(statSync(file(`public${url.pathname}`)).size > 0);
      }
    }
  }
});

test('structured data gives crawlers canonical downloads and the visible configuration anchors', () => {
  const page = html();
  const block = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block);
  const graph = JSON.parse(block[1]!)['@graph'];
  const dataset = graph.find((node: { '@type': string }) => node['@type'] === 'Dataset');
  const webPage = graph.find((node: { '@type': string }) => node['@type'] === 'WebPage');
  assert.equal(webPage.mainEntity['@id'], dataset['@id']);
  assert.equal(dataset.url, origin + SI_PATH);
  assert.equal(dataset.license, SI_LICENSE);
  assert.equal(dataset.isAccessibleForFree, true);
  assert.deepEqual(dataset.distribution.map((item: { contentUrl: string; encodingFormat: string }) => [item.contentUrl, item.encodingFormat]), [
    [`${origin}${SI_DATA_PATH}.csv`, 'text/csv'],
    [`${origin}${SI_DATA_PATH}.json`, 'application/json'],
  ]);
  for (const extension of ['csv', 'json']) assert.ok(page.includes(`href="${SI_DATA_PATH}.${extension}" download`));
  const list = graph.find((node: { '@type': string }) => node['@type'] === 'ItemList');
  assert.equal(list.itemListOrder, 'https://schema.org/ItemListUnordered');
  assert.equal(list.numberOfItems, SI_CALLING.length);
  for (const item of list.itemListElement) {
    const url = new URL(item.url);
    assert.equal(url.origin + url.pathname, dataset.url);
    assert.ok(page.includes(`id="${url.hash.slice(1)}"`));
    assert.equal(item.position, undefined, 'Evidence entries must not imply a performance ranking');
  }
});

test('the index is discoverable and readable without JavaScript or authentication', () => {
  const page = html();
  assert.ok(page.includes(`<link rel="canonical" href="${origin}${SI_PATH}"`));
  assert.doesNotMatch(page, /<meta name="robots" content="[^"]*noindex/);
  for (const evidence of SI_CALLING) {
    assert.ok(page.includes(`id="${evidence.id}"`), evidence.id);
    assert.ok(page.includes(evidence.finding), `${evidence.id} finding must be server rendered`);
    assert.ok(page.includes(evidence.limitation), `${evidence.id} limitation must be server rendered`);
  }
  assert.equal(sitemapEntries(origin).find(entry => entry.loc === origin + SI_PATH)?.lastmod, SI_UPDATED);
  const discovery = llmsTxt(origin, 25);
  for (const path of [SI_PATH, `${SI_DATA_PATH}.csv`, `${SI_DATA_PATH}.json`]) assert.ok(discovery.includes(origin + path));
});

test('future scenarios cannot be mistaken for completed benchmark runs', () => {
  const dataset = siDataset();
  assert.ok(dataset.scenarios.length > 0);
  assert.ok(dataset.configurations.some(row => row.evidence === 'recorded'));
  for (const scenario of dataset.scenarios) {
    assert.equal(scenario.status, 'proposed');
    assert.equal(scenario.executedRuns, 0);
    assert.ok(scenario.brief && scenario.success);
  }
  assert.match(dataset.description, /No comparable performance ranking/);
  const page = html();
  assert.match(page, /older recordings above were not runs of this protocol/);
  assert.match(page, /We build one of the calling tools in this index/);
  assert.match(page, /does not certify that a product has achieved artificial superintelligence/);
});
