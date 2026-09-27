import { now } from '../lib/ids';
import { PROFILE_FIELDS, type Profile, type ProfileKey } from './intake';

export class ProfileError extends Error {}

export function profiles(db: D1Database) {
  return {
    async get(accountId: string): Promise<Profile> {
      const row = await db.prepare(`SELECT fields FROM profiles WHERE account_id = ?`).bind(accountId).first<{ fields: string }>();
      return row ? (JSON.parse(row.fields) as Profile) : {};
    },

    /** Merge `changes` into the profile; an empty string removes a field. Values are checked like at call time. */
    async update(accountId: string, changes: Partial<Record<string, string>>): Promise<Profile> {
      const current = await this.get(accountId);
      for (const [key, raw] of Object.entries(changes)) {
        if (!(key in PROFILE_FIELDS)) throw new ProfileError(`unknown profile field "${key}"; fields are ${Object.keys(PROFILE_FIELDS).join(', ')}`);
        const k = key as ProfileKey;
        const value = (raw ?? '').trim().slice(0, 500);
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
  };
}
