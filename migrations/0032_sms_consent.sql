-- Append-only records of each explicit signup or withdrawal. Tie permission to the
-- verification that proved ownership, so a later verification cannot revive it.
CREATE TABLE sms_consent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  verified_number_id TEXT REFERENCES verified_numbers(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('subscribe', 'revoke')),
  consented_at INTEGER NOT NULL,
  revoked_at INTEGER,
  disclosure_version TEXT NOT NULL,
  disclosure_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK ((action = 'subscribe' AND revoked_at IS NULL) OR (action = 'revoke' AND revoked_at IS NOT NULL))
);
CREATE INDEX sms_consent_events_account ON sms_consent_events(account_id, id DESC);
