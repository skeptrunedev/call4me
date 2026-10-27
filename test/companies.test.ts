import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { COMPANIES } from '../src/content/companies';

/** Minimal CSV parsing for the published dataset (quoted fields may contain commas and doubled quotes). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\n') row.push(cell), rows.push(row), (row = []), (cell = '');
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ''])));
}

test('the /companies hub matches the published time-to-a-human dataset', () => {
  const rows = parseCsv(readFileSync(new URL('../public/static/blog/how-long-to-reach-a-human.csv', import.meta.url), 'utf8')).filter((r) => r.line_type === 'company line');
  const index = readFileSync(new URL('../src/content/blog/index.ts', import.meta.url), 'utf8');
  for (const c of COMPANIES) {
    assert.ok(existsSync(new URL(`../src/content/blog/${c.slug}.md`, import.meta.url)) && index.includes(`slug: '${c.slug}'`), `${c.slug} is a published post`);
    const calls = rows.filter((r) => r.slug === c.slug);
    assert.equal(c.calls, calls.length, `${c.slug} call count`);
    const hit = calls.find((r) => r.reached_human === 'yes' && r.time_to_human);
    const base = hit ?? calls[0]!;
    assert.equal(c.timeToHuman, hit ? hit.time_to_human : null, `${c.slug} time to a person`);
    assert.equal(c.number, base.number_called || null, `${c.slug} number`);
    assert.equal(c.reached, calls.some((r) => r.reached_human === 'yes'), `${c.slug} reached`);
    assert.equal(c.aiFirst, base.ai_assistant_first === 'yes' ? true : base.ai_assistant_first === 'no' ? false : null, `${c.slug} ai first`);
  }
});
