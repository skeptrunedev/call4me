import { jsx } from 'hono/jsx';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { renderAll } from '../src/server/lib/blog';
import { BlogIndex } from '../src/server/views/blog';
import { ExamplesPage } from '../src/server/views/examples';

const source = readFileSync(new URL('../public/static/collection-search.js', import.meta.url), 'utf8');
class Element {
  hidden = false;
  textContent = '';
  value = '';
  dataset: Record<string, string> = {};
  children: Element[] = [];
  listeners: Record<string, (event?: any) => void> = {};
  addEventListener(name: string, fn: (event?: any) => void) { this.listeners[name] = fn; }
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  focus() {}
}
function browser(items: any[]) {
  const form = new Element(); form.dataset.collectionSearch = 'blog';
  const input = new Element(), clear = new Element(), status = new Element(), results = new Element(), original = new Element();
  Object.assign(form, { querySelector: (selector: string) => selector.startsWith('input') ? input : clear });
  const nodes: Record<string, Element> = { 'blog-search-status': status, 'blog-search-results': results, 'blog-search-catalog': Object.assign(new Element(), { textContent: JSON.stringify(items) }) };
  vm.runInNewContext(source, { document: {
    querySelectorAll: (selector: string) => selector === '[data-collection-search]' ? [form] : [original],
    getElementById: (id: string) => nodes[id], createElement: () => new Element(),
  } });
  return { input, clear, status, results, original, form };
}

test('browser search reaches beyond the first page, matches all words and restores the original page', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ slug: `story-${i}`, title: `story ${i}`, subtitle: 'A booking', date: 'Oct 11', text: i === 19 ? 'Café Willow private dinner' : 'ordinary booking' }));
  const b = browser(items);
  b.input.value = 'CAFE dinner'; b.input.listeners.input();
  assert.match(b.status.textContent, /^1 post matching/);
  assert.equal((b.results.children[0].children[0].children[0] as any).href, '/blog/story-19');
  assert.equal(b.original.hidden, true);
  b.input.value = '<script>'; b.input.listeners.input();
  assert.match(b.status.textContent, /^0 posts matching/);
  assert.equal(b.results.children.length, 0);
  let prevented = false;
  b.form.listeners.submit({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  b.clear.listeners.click();
  assert.equal(b.input.value, ''); assert.equal(b.original.hidden, false); assert.equal(b.results.hidden, true);
  b.input.value = '   '; b.input.listeners.input(); assert.equal(b.original.hidden, false);
});

test('blog catalog contains the whole supplied collection, safely escaped and without paid content or media', async () => {
  const all = renderAll([{ slug: 'private', markdown: '---\ntitle: "Quoted" </script><script>alert(1)</script>\nsubtitle: Preview\ndate: 2026-10-11\npaid: true\n---\npublic phrase\n<!-- paywall -->\npaid secret' }]);
  const html = await jsx(BlogIndex, { signedIn: false, posts: [], searchCatalog: all, page: 1, totalPages: 1, total: 0, engagement: new Map(), tab: 'latest', q: '', subscribers: 0, agentPrompt: 'test' }).toString();
  const encoded = /<script id="blog-search-catalog" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1];
  assert.ok(!encoded.includes('</script>'));
  const catalog = JSON.parse(encoded);
  assert.equal(catalog[0].title, all[0].title);
  assert.match(catalog[0].text, /Preview/);
  assert.doesNotMatch(encoded, /public phrase/);
  assert.doesNotMatch(encoded, /paid secret|paidHtml|image|audio/);
});

test('examples search enhances the existing collection without preloading recordings', async () => {
  const html = await jsx(ExamplesPage, { signedIn: false, agentPrompt: 'test' }).toString();
  assert.match(html, /data-collection-search="examples"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /preload="none"/);
  assert.doesNotMatch(html, /preload="metadata"/);
});

test('examples match transcript words and pause recordings hidden by search', () => {
  const form = new Element(); form.dataset.collectionSearch = 'examples';
  const input = new Element(), clear = new Element(), status = new Element(), results = new Element();
  Object.assign(form, { querySelector: (selector: string) => selector.startsWith('input') ? input : clear });
  let pauses = 0;
  const examples = ['booking confirmed', 'haircut moved'].map((text, i) => Object.assign(new Element(), {
    id: `example-${i}`, textContent: text,
    querySelector: () => ({ textContent: `call ${i}` }),
    querySelectorAll: () => [{ pause: () => pauses++ }],
  }));
  vm.runInNewContext(source, { document: {
    querySelectorAll: (selector: string) => selector === '[data-collection-search]' ? [form] : selector === '.example' ? examples : [],
    getElementById: (id: string) => id.endsWith('status') ? status : results,
  }, window: { addEventListener() {} } });
  input.value = 'MOVED'; input.listeners.input();
  assert.equal(examples[0].hidden, true); assert.equal(examples[1].hidden, false);
  assert.equal(pauses, 1); assert.match(status.textContent, /^1 example matching/);
  clear.listeners.click(); assert.equal(examples[0].hidden, false);
});
