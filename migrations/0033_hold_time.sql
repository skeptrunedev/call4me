-- Time spent on hold is billed at half the call's per-minute price. hold_seconds is the hold time
-- already over; hold_since is when a hold still going started (null when not on hold), so the bill
-- at hangup counts an open hold up to the end of the call even if the session never closed it.
ALTER TABLE calls ADD COLUMN hold_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calls ADD COLUMN hold_since INTEGER;
