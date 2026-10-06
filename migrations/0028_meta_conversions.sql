-- Durable Meta Conversions API outbox and audit trail. Stable conversion ids make retries and
-- browser/server copies of the same event deduplicate instead of inflating conversion counts.
-- The payload contains only the hashed account id, browser match ids and approved event metadata.
CREATE TABLE meta_conversions (
  conversion_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  event_name TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  event_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'blocked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_http_status INTEGER,
  last_error TEXT,
  last_response TEXT,
  last_attempt_at INTEGER,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(event_name, source_ref)
);
CREATE INDEX meta_conversions_status ON meta_conversions(status, event_at);
