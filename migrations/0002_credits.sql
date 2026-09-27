-- Credits up front: a call holds its maximum cost before dialing and settles when it ends.
-- SQLite cannot alter a CHECK constraint, so the ledger is rebuilt with the new kinds.
CREATE TABLE ledger_new (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('topup', 'reload', 'hold', 'release', 'call', 'refund', 'adjustment')),
  ref TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO ledger_new SELECT * FROM ledger;
DROP TABLE ledger;
ALTER TABLE ledger_new RENAME TO ledger;
CREATE INDEX ledger_account ON ledger(account_id, created_at);

-- Monthly reload: what a purchase adds by default is charged again every month.
ALTER TABLE accounts ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE accounts ADD COLUMN reload_subscription_id TEXT;
ALTER TABLE accounts ADD COLUMN reload_cents INTEGER;
ALTER TABLE accounts ADD COLUMN reload_status TEXT;
ALTER TABLE accounts ADD COLUMN reload_renews_at INTEGER;

ALTER TABLE topups ADD COLUMN monthly INTEGER NOT NULL DEFAULT 0;

-- The amount held for a call while it runs.
ALTER TABLE calls ADD COLUMN hold_cents INTEGER;
