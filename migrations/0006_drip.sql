-- Lifecycle emails from Nick after signup (services/drip.ts). One row per step sent to an
-- account; the primary key makes each step go out at most once.
CREATE TABLE drip_sends (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  step TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, step)
);

-- Set by the unsubscribe link in every drip email.
ALTER TABLE accounts ADD COLUMN email_opt_out INTEGER NOT NULL DEFAULT 0;
