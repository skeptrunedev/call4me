-- An account's monthly reloads, one row per Stripe subscription. Accounts held a single reload in
-- their own columns; merging two accounts that each pay monthly (Tom's personal and RankSurge
-- accounts) needs room for both, so every reload moves here and the old columns go.
CREATE TABLE reloads (
  subscription_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  cents INTEGER,
  status TEXT,
  renews_at INTEGER
);
CREATE INDEX reloads_account ON reloads (account_id);
INSERT INTO reloads (subscription_id, account_id, cents, status, renews_at)
  SELECT reload_subscription_id, id, reload_cents, reload_status, reload_renews_at FROM accounts WHERE reload_subscription_id IS NOT NULL;
ALTER TABLE accounts DROP COLUMN reload_subscription_id;
ALTER TABLE accounts DROP COLUMN reload_cents;
ALTER TABLE accounts DROP COLUMN reload_status;
ALTER TABLE accounts DROP COLUMN reload_renews_at;
