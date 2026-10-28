-- Time the user spends on a call after taking it over is not billed: call4me is only the bridge
-- then. person_seconds is that time already over; person_since is when a take-over still going
-- started (null when the user is not on), so the bill at hangup counts an open one to the end.
ALTER TABLE calls ADD COLUMN person_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calls ADD COLUMN person_since INTEGER;
