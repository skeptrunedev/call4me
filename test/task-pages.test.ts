import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { TASKS } from '../src/content/tasks';
import { PAGES } from '../src/server/lib/pages';
import { SITEMAP_PAGES } from '../src/server/lib/discovery';

test('every task page cites posts that exist and is in the sitemap', () => {
  for (const task of TASKS) {
    for (const post of task.posts) assert.ok(existsSync(`src/content/blog/${post.slug}.md`), `${task.key}: ${post.slug}`);
    assert.ok(SITEMAP_PAGES.some((e) => e.page === task.key), task.key);
    assert.ok(PAGES[task.key].path.startsWith('/'), task.key);
  }
});

test('task page copy states the live price and has no em dashes', () => {
  for (const task of TASKS) {
    const text = [task.title, PAGES[task.key].description, ...task.answer('$9.99/min'), ...task.how, ...task.posts.map((p) => `${p.label} ${p.fact}`)].join('\n');
    assert.ok(!text.includes('—'), task.key);
    assert.ok(task.answer('$9.99/min')[0]!.includes('$9.99/min'), task.key);
  }
});
