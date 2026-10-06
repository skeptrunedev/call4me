#!/usr/bin/env node
/** Re-deliver recent, real registrations that predate the durable Meta outbox. */
import { ACCOUNT_COLUMNS, type Account } from '../src/server/services/accounts';
import { metaConversions } from '../src/server/lib/meta';
import { cliD1 } from './d1-cli';

const pixelId = process.env.META_PIXEL_ID;
const token = process.env.META_CAPI_TOKEN;
if (!pixelId || !token) throw new Error('META_PIXEL_ID and META_CAPI_TOKEN are required');

const requested = Number(process.argv[2] ?? 10);
const limit = Number.isInteger(requested) ? Math.max(1, Math.min(requested, 50)) : 10;
// Meta accepts CAPI events up to seven days old. Leave a margin for clock and queue delays.
const since = Date.now() - 6 * 24 * 60 * 60 * 1000;
const db = cliD1('--remote');
const { results } = await db
  .prepare(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts a
     WHERE a.created_at >= ?
       AND NOT EXISTS (
         SELECT 1 FROM meta_conversions m
         WHERE m.account_id = a.id AND m.event_name = 'CompleteRegistration'
       )
     ORDER BY a.created_at
     LIMIT ?`,
  )
  .bind(since, limit)
  .all<Account>();

const conversions = metaConversions({ DB: db, META_PIXEL_ID: pixelId, META_CAPI_TOKEN: token });
let sent = 0;
for (const account of results) {
  await conversions.queue(
    account,
    { fbp: account.meta_fbp, fbc: account.meta_fbc, ip: null, userAgent: null, url: null },
    { name: 'CompleteRegistration', id: `signup:${account.id}` },
    account.created_at,
  );
  sent++;
}

console.log(JSON.stringify({ eligibleRecentRegistrations: results.length, queued: sent }));
