-- Accounts whose calls are never held back for credits: Nick's own, which places thousands of calls
-- a month. Every spend still goes on the ledger, so usage and cost stay visible and the balance just
-- runs below zero (services/accounts.ts, spendStatement and fundsOf). Off by default; set by hand,
-- like sales_calls (0036).
ALTER TABLE accounts ADD COLUMN unmetered INTEGER NOT NULL DEFAULT 0;
