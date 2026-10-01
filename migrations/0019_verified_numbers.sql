-- The user's own phone numbers, verified to call from (services/numbers.ts). Telnyx keeps
-- one verified list for our whole carrier account, so this table is what ties a number to the
-- call4me account that proved it holds the phone. Each verification request is a row: the
-- requests per day are counted from it, and a request superseded by a newer one is 'expired'.
CREATE TABLE verified_numbers (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  phone_number TEXT NOT NULL,          -- E.164
  country TEXT NOT NULL,               -- ISO 3166-1 alpha-2
  method TEXT NOT NULL CHECK (method IN ('sms', 'call')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'expired', 'removed')),
  attempts INTEGER NOT NULL DEFAULT 0, -- codes submitted that the carrier refused
  created_at INTEGER NOT NULL,         -- when the code was requested
  verified_at INTEGER,
  removed_at INTEGER
);
-- A number is verified for one account at a time.
CREATE UNIQUE INDEX verified_numbers_verified ON verified_numbers(phone_number) WHERE status = 'verified';
CREATE INDEX verified_numbers_account ON verified_numbers(account_id, created_at);

-- A call placed from the user's own verified number still rings the user from one of the
-- account's call4me numbers when they join: that number. NULL when from_number is a call4me number.
ALTER TABLE calls ADD COLUMN ring_number TEXT;
