import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRelatedIndex } from '../scripts/generate-related-posts';
import { RELATED_INDEX } from '../src/content/blog/related.generated';
import { related, renderPost } from '../src/server/lib/blog';

const post = (slug: string) => renderPost({ slug, markdown: `---\ntitle: ${slug}\nsubtitle: Test article\ndate: 2026-10-07\n---\nGuide.` });

test('published semantic recommendations match current article subjects without model inference', async () => {
  await checkRelatedIndex();
});

test('recommendations keep cost, healthcare and developer articles on subject', () => {
  const top = (slug: string) => RELATED_INDEX[slug]!.slice(0, 3).map((match) => match.slug);
  assert.ok(top('costco-eye-exam-cost').includes('eye-exam-cost-without-insurance'));
  assert.ok(!top('costco-eye-exam-cost').includes('wheel-alignment-cost'));
  assert.ok(top('private-dining-room-cost').includes('book-dinner-reservation-by-phone'));
  assert.ok(!top('private-dining-room-cost').includes('couch-reupholstery-cost'));
  assert.ok(!top('private-dining-room-cost').includes('furniture-refinishing-cost'));
  assert.ok(top('how-to-find-a-new-primary-care-doctor').includes('follow-up-appointment-telehealth'));
  assert.ok(top('grok-bot-template-troubleshooting').includes('grok-bot-templates'));
  assert.ok(!top('follow-up-appointment-telehealth').includes('drop-off-vet-appointment'));
  assert.ok(!top('book-dinner-reservation-by-phone').includes('book-haircut-appointment'));
  assert.ok(top('walmart-oil-change-prices').includes('les-schwab-oil-change'));
});

test('related cards omit unavailable posts and do not fill empty results with unrelated articles', () => {
  const source = post('private-dining-room-cost');
  const first = post(RELATED_INDEX[source.slug]![0]!.slug);
  const unrelated = post('couch-reupholstery-cost');
  assert.deepEqual(related(source, [source, unrelated, first]).map((p) => p.slug), [first.slug]);
  assert.deepEqual(related(source, [source, unrelated]), []);
  assert.deepEqual(related(source, [first], 0), []);
  assert.deepEqual(related(source, [first], -1), []);
  assert.equal(related(source, [first], 1).length, 1);
  assert.throws(() => related(post('unindexed-new-article'), [first]), /Missing related article index/);
});
