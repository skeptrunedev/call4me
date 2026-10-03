-- A bought number can wait on the carrier: an order abroad goes through regulatory review that
-- takes minutes to days. pending: paid for, waiting on the order (order_id); failed: the carrier
-- turned the order down and the price was refunded. SQLite cannot alter a CHECK constraint, so
-- numbers is rebuilt with the new statuses.
CREATE TABLE numbers_new (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  phone_number TEXT NOT NULL,          -- E.164
  country TEXT NOT NULL,               -- ISO 3166-1 alpha-2
  number_type TEXT NOT NULL,           -- Telnyx phone_number_type: local, mobile, national, toll_free
  included INTEGER NOT NULL DEFAULT 0, -- 1 for the free first number; never billed, never released
  monthly_cents INTEGER NOT NULL,      -- what each renewal takes from the balance (0 when included)
  paid_through INTEGER,                -- ms; renewal is due here. NULL when included, or while pending
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'released', 'failed')),
  created_at INTEGER NOT NULL,
  released_at INTEGER,
  order_id TEXT                        -- the carrier's number order, for a number bought after this
);
INSERT INTO numbers_new (id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at, released_at)
  SELECT id, account_id, phone_number, country, number_type, included, monthly_cents, paid_through, status, created_at, released_at FROM numbers;
DROP TABLE numbers;
ALTER TABLE numbers_new RENAME TO numbers;
-- A released number can come back to the carrier's pool and be sold again, so uniqueness covers
-- numbers that are held: active, or paid for and waiting on the carrier.
CREATE UNIQUE INDEX numbers_held ON numbers(phone_number) WHERE status IN ('pending', 'active');
-- One free number per account, even when two first calls race to buy it.
CREATE UNIQUE INDEX numbers_included ON numbers(account_id) WHERE included = 1;
CREATE INDEX numbers_account ON numbers(account_id, status);
CREATE INDEX numbers_due ON numbers(paid_through) WHERE status = 'active' AND included = 0;
CREATE INDEX numbers_pending ON numbers(created_at) WHERE status = 'pending';
