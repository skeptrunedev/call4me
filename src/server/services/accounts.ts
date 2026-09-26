import { newId, now } from '../lib/ids';
import { keyHint, newApiKey, sha256Hex } from '../lib/keys';

export interface Account {
  id: string;
  email: string;
  display_name: string | null;
  key_prefix: string | null;
  created_at: number;
}

export type LedgerKind = 'topup' | 'call' | 'refund' | 'adjustment';

export function accounts(db: D1Database) {
  return {
    async byKey(key: string): Promise<Account | null> {
      return db.prepare(`SELECT id, email, display_name, key_prefix, created_at FROM accounts WHERE key_hash = ?`).bind(await sha256Hex(key)).first<Account>();
    },

    async byId(id: string): Promise<Account | null> {
      return db.prepare(`SELECT id, email, display_name, key_prefix, created_at FROM accounts WHERE id = ?`).bind(id).first<Account>();
    },

    async byEmail(email: string): Promise<Account | null> {
      return db.prepare(`SELECT id, email, display_name, key_prefix, created_at FROM accounts WHERE email = ?`).bind(email.toLowerCase()).first<Account>();
    },

    /** The account for this email, created (without a key) if it does not exist yet. */
    async ensure(email: string): Promise<Account> {
      const normalized = email.trim().toLowerCase();
      await db.prepare(`INSERT OR IGNORE INTO accounts (id, email, created_at) VALUES (?, ?, ?)`).bind(newId(), normalized, now()).run();
      return (await this.byEmail(normalized))!;
    },

    /** Replace the account's API key. The returned key is the only copy that will ever exist. */
    async rotateKey(accountId: string): Promise<string> {
      const key = newApiKey();
      await db.prepare(`UPDATE accounts SET key_hash = ?, key_prefix = ? WHERE id = ?`).bind(await sha256Hex(key), keyHint(key), accountId).run();
      return key;
    },

    async setDisplayName(accountId: string, name: string | null): Promise<void> {
      await db.prepare(`UPDATE accounts SET display_name = ? WHERE id = ?`).bind(name, accountId).run();
    },

    async balanceCents(accountId: string): Promise<number> {
      const row = await db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS b FROM ledger WHERE account_id = ?`).bind(accountId).first<{ b: number }>();
      return row?.b ?? 0;
    },

    /** Idempotent on `ref`: returns false if this entry was already recorded. */
    async post(accountId: string, amountCents: number, kind: LedgerKind, ref: string, note?: string): Promise<boolean> {
      const r = await db
        .prepare(`INSERT OR IGNORE INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(newId(), accountId, amountCents, kind, ref, note ?? null, now())
        .run();
      return (r.meta.changes ?? 0) > 0;
    },

    async ledger(accountId: string, limit = 50) {
      const { results } = await db
        .prepare(`SELECT amount_cents, kind, ref, note, created_at FROM ledger WHERE account_id = ? ORDER BY created_at DESC LIMIT ?`)
        .bind(accountId, limit)
        .all<{ amount_cents: number; kind: LedgerKind; ref: string; note: string | null; created_at: number }>();
      return results;
    },
  };
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
