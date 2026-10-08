-- Campaign links use opaque tokens; only their hashes are stored.
CREATE TABLE email_unsubscribe_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX email_unsubscribe_tokens_account ON email_unsubscribe_tokens(account_id);
