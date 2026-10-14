#!/usr/bin/env node
/**
 * Push support/fernand.config.mjs (tags, smart snippets, automation rules) to the Fernand workspace.
 *
 *   FERNAND_API_KEY=sk_... npm run fernand            apply
 *   FERNAND_API_KEY=sk_... npm run fernand -- --dry   print what would change
 *
 * The key comes from Fernand: Settings → Integrations → API Keys.
 */
import { rules, snippets, tags } from '../support/fernand.config.mjs';

const API = 'https://api.getfernand.com';
const key = process.env.FERNAND_API_KEY;
const dry = process.argv.includes('--dry');
if (!key) {
  console.error('set FERNAND_API_KEY (Fernand: Settings → Integrations → API Keys)');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// List endpoints page with has_more; the workspace is small enough that one page holds everything.
async function list(path) {
  const page = await api('GET', path);
  if (page.has_more) throw new Error(`${path} has more than one page; add paging to fernand-sync`);
  return page.data;
}

async function apply(label, method, path, body) {
  console.log(`${dry ? 'would ' : ''}${method === 'POST' ? 'create' : 'update'} ${label}`);
  if (!dry) await api(method, path, body);
}

const existingTags = new Set((await list('/tags')).map((t) => t.name));
for (const tag of tags) {
  if (!existingTags.has(tag.name)) await apply(`tag ${tag.name}`, 'POST', '/tags', tag);
}

const snippetIds = new Map((await list('/snippets')).map((s) => [s.shortcut, s.id]));
for (const s of snippets) {
  const actions = [{ name: 'messages.custom_message', data: s.reply }];
  if (s.tag) actions.push({ name: 'conversation.tag', data: s.tag });
  if (s.close) actions.push({ name: 'status.close', data: null });
  const body = { title: s.title, shortcut: s.shortcut, actions };
  const id = snippetIds.get(s.shortcut);
  await apply(`snippet /${s.shortcut}`, id ? 'PATCH' : 'POST', id ? `/snippets/${id}` : '/snippets', body);
}

const ruleIds = new Map((await list('/organization/rules')).map((r) => [r.name, r.id]));
for (const [priority, rule] of rules.entries()) {
  const body = { status: 'LIVE', stop: false, priority, filters: null, trigger_data: null, ...rule };
  const id = ruleIds.get(rule.name);
  await apply(`rule "${rule.name}"`, id ? 'PATCH' : 'POST', id ? `/organization/rules/${id}` : '/organization/rules', body);
}
