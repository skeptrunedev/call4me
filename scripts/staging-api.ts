/**
 * What the staging end-to-end tests share: staging's D1, its two test accounts and numbers, and an
 * API client for the business account, which places the test calls.
 *
 * Staging (wrangler.staging.jsonc) has two numbers, each answered by staging's own assistant:
 * staging-test@call4.me's number plays the business, and staging-person@call4.me's number plays a
 * person who joins (its greeting says "this is the person joining the call"). A test call goes from
 * the business account to its own number, so both ends of it are ours.
 *
 * Mints a fresh API key for the staging business account on each run (staging's D1 only).
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cliD1 } from './d1-cli';

export const BUSINESS = 'staging-test@call4.me';
export const PERSON = 'staging-person@call4.me';

const host = readFileSync('wrangler.staging.jsonc', 'utf8').match(/"CANONICAL_HOST":\s*"([^"]+)"/)?.[1];
if (!host) throw new Error('no CANONICAL_HOST in wrangler.staging.jsonc');
const api = `https://${host}/api`;
export const db = cliD1('--remote', 'staging');
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const t0 = Date.now();
/** Seconds since the test started. */
export const at = (ms: number) => `${((ms - t0) / 1000).toFixed(1)}s`;

export const numberOf = async (email: string) => {
  const row = await db.prepare(`SELECT a.id, n.phone_number FROM accounts a JOIN numbers n ON n.account_id = a.id AND n.status = 'active' WHERE a.email = ?`).bind(email).first<{ id: string; phone_number: string }>();
  if (!row) throw new Error(`${email} has no active number on staging`);
  return row;
};
export const business = await numberOf(BUSINESS);

// Same key shape and hash as lib/keys.ts newApiKey/sha256Hex.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const key = `cb_live_${[...randomBytes(32)].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
await db.prepare(`UPDATE accounts SET key_hash = ?, key_prefix = ?, key_sealed = NULL WHERE id = ?`).bind(createHash('sha256').update(key).digest('hex'), `${key.slice(0, 12)}…`, business.id).run();

/** A request to staging's API as the business account. */
export async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${api}${path}`, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as any;
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error ?? res.status}`);
  return json;
}

/** Wait for a placed call to be answered. */
export async function untilAnswered(callId: string, status: string): Promise<void> {
  for (let i = 0; i < 40 && status !== 'in_progress'; i++) {
    await sleep(1500);
    status = (await call('GET', `/calls/${callId}`)).status;
    if (['completed', 'failed', 'no_answer', 'busy'].includes(status)) throw new Error(`the call ended before it was answered: ${status}`);
  }
  if (status !== 'in_progress') throw new Error(`the call never connected (status ${status})`);
}

/**
 * Wait until the two assistants are talking: our caller has said something real and the business
 * answered it. Before that, a caller still told to stay silent through a greeting (staging's
 * assistant can read as an answering machine) may never speak. The API gives each line as "role: text".
 */
export async function untilTalking(callId: string): Promise<boolean> {
  const talking = (t: string[]) => {
    const said = t.findIndex((l) => l.startsWith('caller: ') && l.slice(8).trim().split(/\s+/).length >= 4);
    return said >= 0 && t.slice(said + 1).some((l) => l.startsWith('them: '));
  };
  for (let i = 0; i < 20; i++) {
    await sleep(2_000);
    if (talking(((await call('GET', `/calls/${callId}`)).transcript ?? []) as string[])) return true;
  }
  return false;
}

export interface Row { id: string; account_id: string; direction: string; status: string; end_reason: string | null; answered_at: number | null; ended_at: number | null; transcript: string | null }
export interface Line { role: string; text: string; at: number }

/** Every call on these accounts since the test started: ours and the ones its assistants answered. */
export async function callsSinceStart(accountIds: string[]): Promise<Row[]> {
  const { results } = await db
    .prepare(`SELECT id, account_id, direction, status, end_reason, answered_at, ended_at, transcript FROM calls WHERE created_at >= ? AND account_id IN (${accountIds.map(() => '?').join(', ')}) ORDER BY created_at`)
    .bind(t0 - 5_000, ...accountIds)
    .all<Row>();
  return results;
}

export const lines = (r?: Row): Line[] => (r?.transcript ? (JSON.parse(r.transcript) as Line[]) : []);

export function printSides(sides: [string, Row | undefined][]): void {
  for (const [label, r] of sides) {
    console.log(`\n${label}: ${r ? `${r.id} ${r.status}${r.end_reason ? `, ${r.end_reason}` : ''}` : 'no call recorded'}`);
    for (const l of lines(r)) console.log(`  ${at(l.at).padStart(7)} ${l.role.padEnd(6)} ${l.text.slice(0, 140)}`);
  }
}

export function verdict(checks: readonly (readonly [string, boolean])[]): boolean {
  console.log('');
  for (const [check, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}`);
  return checks.every(([, ok]) => ok);
}
