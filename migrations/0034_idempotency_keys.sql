-- Idempotency-Key on POST /api/calls and POST /api/scheduled-calls (lib/idempotency.ts): a retried
-- request with the same key gets back what the first one made instead of placing another call.
-- Keys are per account and live as long as the row. idempotency_hash fingerprints the request
-- body, so a key reused for a different request is refused; the unique indexes let exactly one of
-- two concurrent requests with the same key through.
ALTER TABLE calls ADD COLUMN idempotency_key TEXT;
ALTER TABLE calls ADD COLUMN idempotency_hash TEXT;
CREATE UNIQUE INDEX calls_idempotency ON calls(account_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE scheduled_calls ADD COLUMN idempotency_key TEXT;
ALTER TABLE scheduled_calls ADD COLUMN idempotency_hash TEXT;
CREATE UNIQUE INDEX scheduled_calls_idempotency ON scheduled_calls(account_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
