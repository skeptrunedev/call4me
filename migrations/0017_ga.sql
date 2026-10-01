-- Google Analytics (lib/ga.ts, services/analytics.ts). An account remembers its browser's gtag
-- client id so server-side events join its visits; a checkout remembers the browser and visit it
-- started in, so the purchase lands in that session.
ALTER TABLE accounts ADD COLUMN ga_client_id TEXT;
-- sign_up goes to GA once, claimed here. Accounts from before GA count as already reported.
ALTER TABLE accounts ADD COLUMN ga_signup_at INTEGER;
UPDATE accounts SET ga_signup_at = created_at;
ALTER TABLE topups ADD COLUMN ga_client_id TEXT;
ALTER TABLE topups ADD COLUMN ga_session_id TEXT;
