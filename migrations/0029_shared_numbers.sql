-- A shared number is one call4me holds for everyone: any account may call its country and goes
-- out from it when it has no number there of its own. It stays on the account that bought it,
-- which pays its renewals. Callbacks to it reach the account that last called the business.
ALTER TABLE numbers ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
CREATE INDEX numbers_shared ON numbers(country) WHERE shared = 1 AND status = 'active';
