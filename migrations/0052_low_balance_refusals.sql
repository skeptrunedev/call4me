-- A call refused because the balance can't pay for its first minute (services/calls.ts) emails the
-- account an add-credits link (services/low-balance.ts): the refused agent can only tell the user
-- to top up, and the user may never read that (chloem0910's ChatGPT, Nov 22). low_balance_refused_at
-- is the latest refusal, low_balance_email_at the latest email, at most one a day, and the claim is
-- the low-credit email's (0047).
ALTER TABLE accounts ADD COLUMN low_balance_refused_at INTEGER;
ALTER TABLE accounts ADD COLUMN low_balance_email_at INTEGER;
ALTER TABLE accounts ADD COLUMN low_balance_email_claim_until INTEGER;
CREATE INDEX accounts_low_balance_refused ON accounts(low_balance_refused_at) WHERE low_balance_refused_at IS NOT NULL;
