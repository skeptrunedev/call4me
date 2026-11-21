-- Deleting particular calls on request (scripts/delete-calls.mjs): support marks a call, and the cron
-- that purges zero data retention calls (services/zdr.ts) deletes its content, voice session storage
-- and carrier recordings the same way, retrying until all of it is gone. Ben asked for three (Nov 21).
ALTER TABLE calls ADD COLUMN delete_requested_at INTEGER;
CREATE INDEX calls_delete_pending ON calls(delete_requested_at) WHERE delete_requested_at IS NOT NULL AND purged_at IS NULL;
