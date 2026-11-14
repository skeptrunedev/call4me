-- The free first number is recorded as pending before it is ordered (services/numbers.ts
-- ensureIncluded), so an order the carrier finishes late still lands on the account. One the
-- carrier turns down is marked failed, and must not stop the account's next first call from
-- ordering again: one free number per account counts only numbers that are held.
DROP INDEX numbers_included;
CREATE UNIQUE INDEX numbers_included ON numbers(account_id) WHERE included = 1 AND status IN ('pending', 'active');
