-- A zero data retention purge that fails (the voice session or the carrier did not finish) is tried
-- again later instead of every minute, so one stuck call cannot hold up the calls behind it.
--
-- purge_attempts counts the failed runs so far, and purge_next_at is the earliest time the next one
-- runs (services/zdr.ts retries with a growing delay up to a cap). Both stay 0 and null until a
-- purge fails.
ALTER TABLE calls ADD COLUMN purge_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calls ADD COLUMN purge_next_at INTEGER;
