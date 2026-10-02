-- Calls to place later (call4me_schedule_call). The minute cron dials each one when it comes due
-- (services/scheduled.ts) through the same path as call4me_place_call, so credits are held then,
-- not when it is scheduled. input is the place_call arguments as given; a call needing a per-call
-- secret (an account PIN) cannot be scheduled, so none is ever stored here.
CREATE TABLE scheduled_calls (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  call_at INTEGER NOT NULL,
  to_number TEXT NOT NULL,
  business TEXT NOT NULL,
  goal TEXT NOT NULL,
  input TEXT NOT NULL,
  surface TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'dialing', 'placed', 'failed', 'canceled')),
  -- The call it became, once dialed (or the failed call row, when placing it was refused).
  call_id TEXT REFERENCES calls(id),
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX scheduled_calls_due ON scheduled_calls(status, call_at);
CREATE INDEX scheduled_calls_account ON scheduled_calls(account_id, call_at);
