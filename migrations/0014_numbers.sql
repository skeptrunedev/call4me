-- An account can hold several phone numbers, including numbers in other countries. The first
-- US number stays free (bought on the first call); every extra number is paid from credits at
-- Telnyx's own price: its upfront plus first month when bought, then its monthly cost.
-- accounts.phone_number is superseded by this table (SQLite cannot drop a UNIQUE column).
CREATE TABLE numbers (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  phone_number TEXT NOT NULL,          -- E.164
  country TEXT NOT NULL,               -- ISO 3166-1 alpha-2
  number_type TEXT NOT NULL,           -- Telnyx phone_number_type: local, mobile, national, toll_free
  included INTEGER NOT NULL DEFAULT 0, -- 1 for the free first number; never billed, never released
  monthly_cents INTEGER NOT NULL,      -- what each renewal takes from the balance (0 when included)
  paid_through INTEGER,                -- ms; renewal is due here. NULL when included
  status TEXT NOT NULL CHECK (status IN ('active', 'released')),
  created_at INTEGER NOT NULL,
  released_at INTEGER
);
-- A released number can come back to Telnyx's pool and be sold again, so uniqueness is per active number.
CREATE UNIQUE INDEX numbers_active ON numbers(phone_number) WHERE status = 'active';
-- One free number per account, even when two first calls race to buy it.
CREATE UNIQUE INDEX numbers_included ON numbers(account_id) WHERE included = 1;
CREATE INDEX numbers_account ON numbers(account_id, status);
CREATE INDEX numbers_due ON numbers(paid_through) WHERE status = 'active' AND included = 0;

INSERT INTO numbers (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at)
SELECT lower(hex(randomblob(8))), id, phone_number, 'US', 'local', 1, 0, NULL, 'active', created_at FROM accounts WHERE phone_number IS NOT NULL;

-- 'number' entries pay for numbers. SQLite cannot alter a CHECK constraint, so the ledger is rebuilt.
CREATE TABLE ledger_new (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('topup', 'reload', 'hold', 'release', 'call', 'refund', 'adjustment', 'number')),
  ref TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO ledger_new SELECT * FROM ledger;
DROP TABLE ledger;
ALTER TABLE ledger_new RENAME TO ledger;
CREATE INDEX ledger_account ON ledger(account_id, created_at);

-- What a number costs in each country and whether it can be bought, refreshed by the cron so
-- pages never wait on the carrier. Buying always re-checks live.
CREATE TABLE number_offers (
  country TEXT PRIMARY KEY,
  available INTEGER NOT NULL,
  reason TEXT,
  upfront_cents INTEGER,
  monthly_cents INTEGER,
  checked_at INTEGER NOT NULL
);
