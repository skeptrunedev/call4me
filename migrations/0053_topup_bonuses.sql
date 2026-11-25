-- A top-up bonus Nick gives an account (npm run bonus): each of its next `remaining` payments
-- (NULL: every payment) gets `percent` more credits on top, added by the every-minute cron
-- (services/topup-bonuses.ts). Only payments made after it was set count. The row goes once its
-- last use is spent.
CREATE TABLE topup_bonuses (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
  remaining INTEGER CHECK (remaining IS NULL OR remaining > 0),
  note TEXT,
  created_at INTEGER NOT NULL
);

-- One row per payment a bonus was added for. `claim` is the cron run that added it: the bonus's
-- ledger entry and the use it spends are written only when this row is that run's. The customer
-- is emailed once (emailed_at), with a claim like the low-credit emails' so overlapping runs
-- don't both send.
CREATE TABLE topup_bonus_grants (
  payment_ledger_id TEXT PRIMARY KEY REFERENCES ledger(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  payment_cents INTEGER NOT NULL,
  bonus_cents INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  claim TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  emailed_at INTEGER,
  email_claim_until INTEGER
);
CREATE INDEX topup_bonus_grants_unemailed ON topup_bonus_grants(emailed_at) WHERE emailed_at IS NULL;
