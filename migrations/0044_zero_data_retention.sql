-- Zero data retention (services/zdr.ts): an account opts in, and every call it makes or answers
-- from then on is stamped zdr, billed at 1.5x, and has its content deleted an hour after it ends.
-- purged_at is when that deletion finished (the D1 content, the voice session's storage and the
-- carrier's recording); null while it is pending or still retrying.
ALTER TABLE accounts ADD COLUMN zdr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calls ADD COLUMN zdr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calls ADD COLUMN purged_at INTEGER;
CREATE INDEX calls_zdr_pending ON calls(ended_at) WHERE zdr = 1 AND purged_at IS NULL;
