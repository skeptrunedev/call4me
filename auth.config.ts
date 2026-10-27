/**
 * CLI-only better-auth config used to generate migrations/0004_auth.sql:
 *   npx auth generate --config auth.config.ts --output migrations/0004_auth.sql -y
 * The CLI introspects an empty in-memory SQLite database; the SQL applies unchanged to D1.
 */
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { authOptions } from './src/server/lib/auth-options';

export const auth = betterAuth(
  authOptions({
    database: new DatabaseSync(':memory:'),
    secret: 'cli-only-not-a-real-secret-0000000000',
    baseURL: 'http://localhost:8791',
    appName: 'callbay',
    google: { clientId: 'x', clientSecret: 'x' },
    twitter: { clientId: 'x', clientSecret: 'x' },
  }),
);
