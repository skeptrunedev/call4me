/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
/** Prebuild public documents using the same views as the dynamic application. No database or credentials. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { unstable_readConfig } from 'wrangler';
import type { Child } from 'hono/jsx';
import { StaticRenderContext } from '../src/server/lib/static-render';
import { HomePage, RulesPage, PrivacyPage, TermsPage, SupportPage } from '../src/server/views/public';
import { ExamplesPage } from '../src/server/views/examples';
import { VoicesPage } from '../src/server/views/voices';
import { CompaniesPage } from '../src/server/views/companies';
import { SuperintelligenceCallingPage } from '../src/server/views/superintelligence-calling';
import { SI_DATA_PATH, SI_PATH, siCsv, siDataset } from '../src/content/superintelligence-calling';
import { StudentsPage } from '../src/server/views/students';
import { McpPage } from '../src/server/views/account';
import { BlogIndex, BlogArchive, BlogPost } from '../src/server/views/blog';
import { archive, atomFeed, related, renderAll, rssFeed } from '../src/server/lib/blog';
import { blogIndexPath, paginatePosts } from '../src/server/lib/blog-pagination';
import { approxTokens, htmlToMarkdown } from '../src/server/lib/markdown';
import * as prompts from '../src/server/lib/prompts';

registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('.md')) return { format: 'module', source: `export default ${JSON.stringify(requireText(url))}`, shortCircuit: true };
  return nextLoad(url, context);
} });
// Synchronous hook follows the existing test loader; publication content is local text.
import { readFileSync } from 'node:fs';
const requireText = (url: string) => readFileSync(new URL(url), 'utf8');
const { POST_SOURCES } = await import('../src/content/blog/index');
const config = unstable_readConfig({ config: 'wrangler.jsonc' });
const vars = config.vars as Record<string, string>;
const origin = `https://${vars.CANONICAL_HOST}`;
assert.equal(origin, 'https://call4.me', 'static canonical origin must match the deployed site');
const price = Number(vars.PRICE_PER_MINUTE_CENTS);
assert.ok(Number.isSafeInteger(price) && price > 0, 'public price must be configured');
const renderConfig = { metaPixelId: vars.META_PIXEL_ID, metaDomainVerification: vars.META_DOMAIN_VERIFICATION, redditPixelId: vars.REDDIT_PIXEL_ID };
const destination = 'dist/site';
// This directory contains only this build's generated assets.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp('public', destination, { recursive: true });
await mkdir(join(destination, 'static/data'), { recursive: true });
await writeFile(join(destination, `${SI_DATA_PATH}.csv`), siCsv());
await writeFile(join(destination, `${SI_DATA_PATH}.json`), JSON.stringify(siDataset(), null, 2) + '\n');

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(directory, e.name)) : [join(directory, e.name)]))).flat();
}
// Content addressed CSS and JavaScript can stay in browser caches across page navigation.
const assetNames = new Map<string, string>();
const immutable: string[] = [];
for (const file of await files('public/static')) {
  if (!/\.(css|js)$/.test(file)) continue;
  const bytes = await readFile(file);
  const path = '/' + relative('public', file);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const hashed = path.replace(/\.(css|js)$/, `.${hash}.$1`);
  await writeFile(join(destination, hashed), bytes);
  assetNames.set(path, hashed);
  immutable.push(hashed);
}
const manifest: Record<string, { html: string; markdown: string; tokens: number }> = {};
async function page(path: string, view: Child) {
  let html = await (<StaticRenderContext.Provider value={renderConfig}>{view}</StaticRenderContext.Provider>).toString();
  assert.ok(html.startsWith('<!DOCTYPE html>'), `${path}: document missing`);
  assert.ok(!html.includes('producthunt.com'), `${path}: Product Hunt badge must stay removed`);
  for (const [old, hashed] of assetNames) html = html.replaceAll(`"${old}"`, `"${hashed}"`);
  const id = createHash('sha256').update(path).digest('hex').slice(0, 16);
  const htmlPath = `/__pages/${id}.html`;
  const markdownPath = `/__pages/${id}.md`;
  const markdown = htmlToMarkdown(html, origin + path);
  await mkdir(dirname(join(destination, htmlPath)), { recursive: true });
  await writeFile(join(destination, htmlPath), html);
  await writeFile(join(destination, markdownPath), markdown);
  manifest[path] = { html: htmlPath, markdown: markdownPath, tokens: approxTokens(markdown) };
}
const common = { signedIn: false };
const installPrompt = prompts.installPrompt(origin, null);
await page('/', <HomePage {...common} origin={origin} pricePerMinuteCents={price} installPrompt={installPrompt} countries={[]} />);
await page('/examples', <ExamplesPage {...common} agentPrompt={prompts.examplesPrompt(origin, null)} />);
await page('/voices', <VoicesPage {...common} agentPrompt={prompts.voicesPrompt(origin, null)} />);
await page('/companies', <CompaniesPage {...common} agentPrompt={prompts.companiesPrompt(origin, null)} />);
await page(SI_PATH, <SuperintelligenceCallingPage {...common} />);
await page('/students', <StudentsPage {...common} agentPrompt={prompts.studentsPrompt(origin, null)} />);
await page('/mcp', <McpPage {...common} origin={origin} installPrompt={installPrompt} apiKey={null} />);
await page('/rules', <RulesPage {...common} pricePerMinuteCents={price} countries={[]} agentPrompt={prompts.rulesPrompt(origin, null)} />);
await page('/privacy', <PrivacyPage {...common} agentPrompt={prompts.privacyPrompt(origin, null)} />);
await page('/terms', <TermsPage {...common} agentPrompt={prompts.termsPrompt(origin, null)} />);
await page('/support', <SupportPage {...common} agentPrompt={prompts.supportPrompt(origin, null)} />);
const all = renderAll(POST_SOURCES);
const engagement = new Map(all.map(p => [p.slug, { likes: 0, comments: 0 }]));
const pages = paginatePosts(all).totalPages;
for (let number = 1; number <= pages; number++) {
  await page(blogIndexPath({ page: number }), <BlogIndex {...common} {...paginatePosts(all, String(number))} engagement={engagement} tab="latest" q="" subscribers={0} agentPrompt={prompts.blogPrompt(origin, null)} />);
}
await page('/blog/archive', <BlogArchive {...common} groups={archive(all)} engagement={engagement} agentPrompt={prompts.blogPrompt(origin, null)} />);
for (const [i, post] of all.entries()) {
  if (post.paid) continue; // Access-controlled articles always use the authenticated server.
  await page(`/blog/${post.slug}`, <BlogPost {...common} supporter={false} post={post} older={all[i + 1] ?? null} newer={all[i - 1] ?? null} related={related(post, all)} engagement={{ likes: 0, comments: 0 }} liked={false} comments={[]} subscribers={0} unlocked agentPrompt={prompts.postPrompt(origin, null, post.slug, post.title)} />);
}
await mkdir(join(destination, 'blog'), { recursive: true });
await writeFile(join(destination, 'blog/feed.xml'), atomFeed(origin, all));
await writeFile(join(destination, 'blog/rss.xml'), rssFeed(origin, all));
await writeFile(join(destination, '_headers'), immutable.map(path => `${path}\n  Cache-Control: public, max-age=31536000, immutable\n`).join('\n'));
const generated = `// Generated by npm run build:site. Public documents only; never include account data.\nexport const STATIC_PAGES: Record<string, { html: string; markdown: string; tokens: number }> = ${JSON.stringify(manifest, null, 2)};\n`;
const manifestFile = 'src/server/static-manifest.generated.ts';
// Avoid triggering the development worker's file watcher when content has not changed.
if (await readFile(manifestFile, 'utf8').catch(() => '') !== generated) await writeFile(manifestFile, generated);
console.log(`Prebuilt ${Object.keys(manifest).length} public pages and Markdown documents, ${immutable.length} fingerprinted assets, and both blog feeds.`);
