import { now } from '../lib/ids';
import { normalizeAccent, normalizeName, PROFILE_FIELDS, type Profile, type ProfileKey } from './intake';

export class ProfileError extends Error {}

/** The profile a profiles row holds; none saved is an empty one. */
export const profileOf = (row: { fields: string } | null | undefined): Profile => (row ? (JSON.parse(row.fields) as Profile) : {});

export function profiles(db: D1Database) {
  return {
    async get(accountId: string): Promise<Profile> {
      return profileOf(await this.getStatement(accountId).first<{ fields: string }>());
    },

    /** get's statement, to read in a batch with others; profileOf reads its row. */
    getStatement(accountId: string): D1PreparedStatement {
      return db.prepare(`SELECT fields FROM profiles WHERE account_id = ?`).bind(accountId);
    },

    /** Merge `changes` into the profile; an empty string removes a field. Values are checked like at call time. */
    async update(accountId: string, changes: Partial<Record<string, string>>): Promise<Profile> {
      const current = await this.get(accountId);
      for (const [key, raw] of Object.entries(changes)) {
        if (!(key in PROFILE_FIELDS)) throw new ProfileError(`unknown profile field "${key}"; fields are ${Object.keys(PROFILE_FIELDS).join(', ')}`);
        const k = key as ProfileKey;
        const trimmed = (raw ?? '').trim().slice(0, 500);
        const value = k === 'accent' ? normalizeAccent(trimmed) : k === 'assistant_name' ? normalizeName(trimmed) : trimmed;
        if (!value) {
          delete current[k];
          continue;
        }
        const problem = PROFILE_FIELDS[k].check?.(value);
        if (problem) throw new ProfileError(`${key}: ${problem}`);
        current[k] = value;
      }
      await db
        .prepare(`INSERT INTO profiles (account_id, fields, updated_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET fields = excluded.fields, updated_at = excluded.updated_at`)
        .bind(accountId, JSON.stringify(current), now())
        .run();
      return current;
    },

    /** Delete every saved field. */
    async clear(accountId: string): Promise<void> {
      await db.prepare(`DELETE FROM profiles WHERE account_id = ?`).bind(accountId).run();
    },
  };
}
