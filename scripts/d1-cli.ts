/**
 * The D1 binding's prepare/bind/first/all/run, over `wrangler d1 execute`, so a script can run
 * the same service code the Worker does (services/numbers.ts, services/accounts.ts) against the
 * remote database. Bound values are written into the statement as SQL literals: the CLI takes no
 * parameters. Both "?" and numbered "?N" placeholders are supported. Service SQL has no "?"
 * outside its placeholders, which is what makes this safe.
 */
import { execFileSync } from 'node:child_process';

const literal = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
};

function bindAll(sql: string, args: unknown[]): string {
  // "?NNN" takes the NNNth value (1-based), a bare "?" the next one, as in SQLite.
  let next = 0;
  let used = 0;
  const out = sql.replace(/\?(\d+)?/g, (_, n: string | undefined) => {
    const i = n ? Number(n) - 1 : next++;
    if (i >= args.length) throw new Error(`placeholder ${n ? `?${n}` : `#${i + 1}`} has no value in: ${sql}`);
    used = Math.max(used, i + 1);
    return literal(args[i]);
  });
  if (used !== args.length) throw new Error(`${args.length} values for ${used} placeholders in: ${sql}`);
  return out;
}

export function cliD1(where: '--remote' | '--local' = '--remote'): D1Database {
  const execute = (sql: string) => {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    return JSON.parse(out)[0] as { results: unknown[]; meta?: { changes?: number } };
  };
  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    first: async <T>() => (execute(bindAll(sql, args)).results[0] as T) ?? null,
    all: async <T>() => ({ results: execute(bindAll(sql, args)).results as T[] }),
    run: async () => ({ meta: { changes: execute(bindAll(sql, args)).meta?.changes ?? 0 } }),
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}
