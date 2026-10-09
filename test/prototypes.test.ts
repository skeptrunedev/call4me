import assert from 'node:assert/strict';
import test from 'node:test';
import { PrototypePage, PROTOTYPE_STYLES } from '../src/server/views/prototypes';
import { HomePage, HomeRecordings, HomeActions, HomeCredits, HomeSetup, HomeAbout, HomeStories, Faq } from '../src/server/views/public';
import { pub } from '../src/server/routes/public';

const props = { origin: 'https://call4.me', pricePerMinuteCents: 25, signedIn: false, installPrompt: 'Install https://call4.me/mcp and sign in', countries: [] };

test('every design preserves each original content section and functional recording payload', () => {
  const original = String(HomePage(props));
  const sections = [HomeRecordings({}), HomeActions({}), HomeCredits(props), HomeSetup(props), HomeAbout({}), HomeStories({}), Faq(props)].map(String);
  for (const style of PROTOTYPE_STYLES) {
    const html = String(PrototypePage({ ...props, style }));
    for (const section of sections) {
      assert.ok(original.includes(section), 'section stays identical on the original homepage');
      assert.ok(html.includes(section), `${style} keeps original content`);
    }
    assert.equal((html.match(/class="player"/g) ?? []).length, 4);
    assert.equal((html.match(/<details>/g) ?? []).length, 9);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.match(html, /method="post" action="\/buy"/);
    assert.match(html, /<input type="checkbox" name="monthly" checked/);
    assert.match(html, /aria-current="page"/);
  }
});

test('prototype URLs reject unknown designs and the chooser opens the first design', async () => {
  const index = await pub.request('https://call4.me/prototypes');
  assert.equal(index.status, 302);
  assert.equal(index.headers.get('location'), '/prototypes/userjot');
  const unknown = await pub.request('https://call4.me/prototypes/unknown');
  assert.equal(unknown.status, 404);
});
