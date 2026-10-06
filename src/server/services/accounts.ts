import { newId, now } from '../lib/ids';
import { keyHint, newApiKey, normalizeKey, sealKey, sha256Hex, unsealKey } from '../lib/keys';

export interface Account {
  id: string;
  email: string;
  display_name: string | null;
  key_prefix: string | null;
  created_at: number;
  /** gtag's client id from the account's latest signed-in browser (lib/ga.ts). */
  ga_client_id: string | null;
  /** When GA was sent this account's sign_up; null until its first tracked activity. */
  ga_signup_at: number | null;
  /** Meta's browser id and latest ad click from the account's signed-in browser (lib/meta.ts). */
  meta_fbp: string | null;
  meta_fbc: string | null;
  /** Where the account first came from, as JSON (lib/first-touch.ts); null until a browser shows it. */
  first_touch: string | null;
  /** Our recorded paid Reddit visits, distinct from Reddit's own click/view attribution. */
  reddit_first_visit_id: string | null;
  reddit_last_visit_id: string | null;
}

/** The columns every Account is read with. */
export const ACCOUNT_COLUMNS = `id, email, display_name, key_prefix, created_at, ga_client_id, ga_signup_at, meta_fbp, meta_fbc, first_touch, reddit_first_visit_id, reddit_last_visit_id`;

export type LedgerKind = 'topup' | 'reload' | 'hold' | 'release' | 'call' | 'refund' | 'adjustment' | 'number';

export function accounts(db: D1Database) {
  return {
    /** The account a presented key belongs to, after undoing what clients do to keys in transit (normalizeKey). */
    async byKey(key: string): Promise<Account | null> {
      return db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE key_hash = ?`).bind(await sha256Hex(normalizeKey(key))).first<Account>();
    },

    async byId(id: string): Promise<Account | null> {
      return db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`).bind(id).first<Account>();
    },

    async byEmail(email: string): Promise<Account | null> {
      return db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE email = ?`).bind(email.toLowerCase()).first<Account>();
    },

    /** The account for this email, created (without a key) if it does not exist yet. */
    async ensure(email: string): Promise<Account> {
      const normalized = email.trim().toLowerCase();
      await db.prepare(`INSERT OR IGNORE INTO accounts (id, email, created_at) VALUES (?, ?, ?)`).bind(newId(), normalized, now()).run();
      return (await this.byEmail(normalized))!;
    },

    /** Replace the account's API key; the old one stops working. `secret` seals the stored copy. */
    async rotateKey(accountId: string, secret: string): Promise<string> {
      const key = newApiKey();
      await db
        .prepare(`UPDATE accounts SET key_hash = ?, key_prefix = ?, key_sealed = ? WHERE id = ?`)
        .bind(await sha256Hex(key), keyHint(key), await sealKey(secret, key), accountId)
        .run();
      return key;
    },

    /**
     * The key the site puts into this account's copy prompts: its current key, recovered from
     * the sealed copy. An account without a recoverable key (none yet, or one issued before keys
     * were sealed) gets a new one; concurrent page loads race on the guard and all show the winner.
     */
    async promptKey(accountId: string, secret: string): Promise<string> {
      const row = await db.prepare(`SELECT key_sealed FROM accounts WHERE id = ?`).bind(accountId).first<{ key_sealed: string | null }>();
      const current = row?.key_sealed ? await unsealKey(secret, row.key_sealed) : null;
      if (current) return current;
      const key = newApiKey();
      const r = await db
        .prepare(`UPDATE accounts SET key_hash = ?, key_prefix = ?, key_sealed = ? WHERE id = ? AND key_sealed IS ?`)
        .bind(await sha256Hex(key), keyHint(key), await sealKey(secret, key), accountId, row?.key_sealed ?? null)
        .run();
      return (r.meta.changes ?? 0) > 0 ? key : this.promptKey(accountId, secret);
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

    /**
     * Take `cents` out of the balance only if the balance covers it, in one statement so two
     * concurrent calls cannot both spend the same credits. False when the balance is short.
     */
    async hold(accountId: string, cents: number, ref: string, note: string): Promise<boolean> {
      return this.spend(accountId, cents, 'hold', ref, note);
    },

    /** Take `cents` out as `kind` only if the balance covers it (see hold). False when short or already recorded. */
    async spend(accountId: string, cents: number, kind: LedgerKind, ref: string, note: string): Promise<boolean> {
      const r = await db
        .prepare(
          `INSERT OR IGNORE INTO ledger (id, account_id, amount_cents, kind, ref, note, created_at)
           SELECT ?1, ?2, -?3, ?4, ?5, ?6, ?7
           WHERE (SELECT COALESCE(SUM(amount_cents), 0) FROM ledger WHERE account_id = ?2) >= ?3`,
        )
        .bind(newId(), accountId, cents, kind, ref, note, now())
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
