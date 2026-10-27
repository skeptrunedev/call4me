import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * D1 for tests that hang on real SQL (partial unique indexes, status changes): every migration run
 * on an in-memory SQLite, behind the prepare/bind/first/all/run calls the services and better-auth use. Seeded with
 * the accounts acct_alice and acct_bob.
 */
export function d1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../migrations', import.meta.url)).sort()) sqlite.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  sqlite.exec(`INSERT INTO accounts (id, email, created_at) VALUES ('acct_alice', 'alice@example.com', 0), ('acct_bob', 'bob@example.com', 0)`);
  const statement = (sql: string, args: SQLInputValue[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next as SQLInputValue[]),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => {
      const prepared = sqlite.prepare(sql);
      if (prepared.columns().length) return { results: prepared.all(...args), meta: {} };
      const { changes, lastInsertRowid } = prepared.run(...args);
      return { results: [], meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid) } };
    },
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
  });
  // batch and exec complete the binding better-auth recognizes as D1.
  type Statement = ReturnType<typeof statement>;
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: Statement[]) => Promise.all(statements.map((s) => s.all())),
    exec: async (sql: string) => sqlite.exec(sql),
  } as unknown as D1Database;
}
