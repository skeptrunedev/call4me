-- The facts that are the same on every call (name, DOB, phone, address, insurance, car),
-- collected once so the agent doesn't ask before every call. JSON object of ProfileKey -> string.
CREATE TABLE profiles (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  fields TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

ALTER TABLE calls ADD COLUMN category TEXT;
