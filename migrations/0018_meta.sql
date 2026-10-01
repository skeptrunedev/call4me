-- Meta ads (lib/meta.ts, services/analytics.ts). An account remembers its latest browser's Meta
-- ids so events with no browser (agents placing calls, monthly reloads) still match it.
ALTER TABLE accounts ADD COLUMN meta_fbp TEXT;
ALTER TABLE accounts ADD COLUMN meta_fbc TEXT;
-- A checkout remembers the browser it started in. The Purchase is a website event, which needs
-- the user agent, and the IP address improves matching.
ALTER TABLE topups ADD COLUMN meta_fbp TEXT;
ALTER TABLE topups ADD COLUMN meta_fbc TEXT;
ALTER TABLE topups ADD COLUMN meta_ip TEXT;
ALTER TABLE topups ADD COLUMN meta_user_agent TEXT;
