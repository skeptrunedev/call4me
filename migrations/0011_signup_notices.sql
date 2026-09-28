-- One row per account Nick has been emailed about (services/signups.ts). Accounts that exist
-- now are marked as already announced, so only signups from here on send an email.
CREATE TABLE signup_notices (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  sent_at INTEGER NOT NULL
);
INSERT INTO signup_notices (account_id, sent_at) SELECT id, created_at FROM accounts;
