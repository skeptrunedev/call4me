-- Accounts approved for business-to-business sales and outreach calls (off by default: the rules
-- forbid telemarketing). Set by hand for an account Nick approves.
ALTER TABLE accounts ADD COLUMN sales_calls INTEGER NOT NULL DEFAULT 0;
