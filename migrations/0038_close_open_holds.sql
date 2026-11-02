-- Calls that ended while on hold (or taken over) were billed for that time, but the open span was
-- never folded into hold_seconds / person_seconds, so usage and the account page showed 0 on hold.
-- calls.finish closes them now; this closes the ones already ended.
UPDATE calls
SET hold_seconds = hold_seconds + MAX(0, CAST(ROUND((ended_at - hold_since) / 1000.0) AS INTEGER)), hold_since = NULL
WHERE ended_at IS NOT NULL AND hold_since IS NOT NULL AND status NOT IN ('queued', 'dialing', 'in_progress');
UPDATE calls
SET person_seconds = person_seconds + MAX(0, CAST(ROUND((ended_at - person_since) / 1000.0) AS INTEGER)), person_since = NULL
WHERE ended_at IS NOT NULL AND person_since IS NOT NULL AND status NOT IN ('queued', 'dialing', 'in_progress');
