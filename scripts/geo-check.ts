/**
 * Ask ChatGPT search (Responses API, web_search tool) the questions people ask before they find
 * us, and report how often each answer names call4me, cites call4.me, which domains it cites and
 * which competitors it names. Answers vary run to run, so --runs N asks every prompt N times and
 * reports rates. Prompts and competitor patterns live in scripts/geo-check.json.
 *
 *   npm run geo:check -- [--runs N] [--model gpt-5.5] [--out file.json]
 *
 * Needs OPENAI_API_KEY (falls back to .dev.vars). Writes every answer to scratch/geo/<time>.json
 * (gitignored) unless --out is given, so weekly runs can be compared.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { runs: { type: 'string', default: '1' }, model: { type: 'string', default: 'gpt-5.5' }, out: { type: 'string' } } });
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) throw new Error('usage: npm run geo:check -- [--runs N] [--model gpt-5.5] [--out file.json]');
if (!process.env.OPENAI_API_KEY && existsSync('.dev.vars')) loadEnvFile('.dev.vars');
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');

const config = JSON.parse(readFileSync(new URL('geo-check.json', import.meta.url), 'utf8')) as { prompts: string[]; competitors: Record<string, string> };
const competitors = Object.entries(config.competitors).map(([name, pattern]) => ({ name, re: new RegExp(`\\b(?:${pattern})\\b`, 'i') }));
const BRAND = /call4\.?me|call 4 me/i;
const OWN_HOST = 'call4.me';
/** Parallel requests; each web-search answer takes 20 to 90 seconds. */
const CONCURRENCY = 8;

interface Answer { prompt: string; run: number; text: string; urls: string[]; mentioned: boolean; cited: boolean; domains: string[]; competitors: string[]; error?: string }

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
// The tool tags every link with utm_source=openai; drop it so URLs compare across runs.
const clean = (url: string) => url.replace(/[?&]utm_source=openai$/, '').replace(/\?utm_source=openai&/, '?');

async function ask(prompt: string, run: number): Promise<Answer> {
  const blank = { prompt, run, text: '', urls: [], mentioned: false, cited: false, domains: [], competitors: [] };
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: values.model, tools: [{ type: 'web_search' }], input: prompt, store: false }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) return { ...blank, error: `OpenAI ${response.status}: ${(await response.text()).slice(0, 200)}` };
    const body = await response.json() as { output?: { type: string; content?: { text?: string; annotations?: { url?: string }[] }[] }[] };
    const parts = (body.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
    const text = parts.map((c) => c.text ?? '').join('');
    const urls = [...new Set(parts.flatMap((c) => c.annotations ?? []).flatMap((a) => (a.url ? [clean(a.url)] : [])))];
    const domains = [...new Set(urls.map(host))];
    return { prompt, run, text, urls, mentioned: BRAND.test(text), cited: domains.includes(OWN_HOST), domains, competitors: competitors.filter((c) => c.re.test(text)).map((c) => c.name) };
  } catch (error) {
    return { ...blank, error: error instanceof Error ? error.message : String(error) };
  }
}

const jobs = Array.from({ length: runs }, (_, run) => config.prompts.map((prompt) => () => ask(prompt, run + 1))).flat();
const answers: Answer[] = [];
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const answer = await jobs[next++]();
    answers.push(answer);
    process.stderr.write(`\r${answers.length}/${jobs.length} answers`);
  }
}));
process.stderr.write('\n');

const ok = answers.filter((a) => !a.error);
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : 'n/a');
const tally = (names: string[]) => [...names.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

console.log(`${values.model}, ${config.prompts.length} prompts x ${runs} run(s): ${ok.length} answers, ${answers.length - ok.length} failed\n`);
console.log('mentioned  cited  prompt');
for (const prompt of config.prompts) {
  const mine = ok.filter((a) => a.prompt === prompt);
  const m = mine.filter((a) => a.mentioned).length, c = mine.filter((a) => a.cited).length;
  console.log(`${`${m}/${mine.length}`.padEnd(9)}  ${`${c}/${mine.length}`.padEnd(5)}  ${prompt}`);
}
console.log(`\ncall4me mentioned in ${pct(ok.filter((a) => a.mentioned).length, ok.length)} of answers, call4.me cited in ${pct(ok.filter((a) => a.cited).length, ok.length)}`);
console.log(`\nCompetitors named (answers): ${tally(ok.flatMap((a) => a.competitors)).map(([n, k]) => `${n} ${k}`).join(', ')}`);
console.log(`\nMost cited domains (answers): ${tally(ok.flatMap((a) => a.domains)).slice(0, 15).map(([n, k]) => `${n} ${k}`).join(', ')}`);
for (const a of answers.filter((a) => a.error)) console.error(`failed (run ${a.run}): ${a.prompt}: ${a.error}`);

const at = new Date().toISOString();
const out = values.out ?? new URL(`../scratch/geo/${at.replace(/[:.]/g, '-')}.json`, import.meta.url).pathname;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ at, model: values.model, runs, answers: answers.sort((a, b) => config.prompts.indexOf(a.prompt) - config.prompts.indexOf(b.prompt) || a.run - b.run) }, null, 1));
console.log(`\nWrote ${out}`);
if (answers.length > ok.length) process.exitCode = 1;
