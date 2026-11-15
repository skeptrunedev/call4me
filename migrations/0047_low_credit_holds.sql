-- A call on hold whose credits can't fund the next extension at its time limit would wrap up there
-- and lose its place in the queue, so the user is emailed first to add credits. The voice session
-- records it once per call: low_credit_at is when it found the credits short, low_credit_deadline_at
-- when the call wraps up unless credits are added, and low_credit_minutes how many minutes that
-- left. The site's every-minute cron sends the email while the call is still holding
-- (services/low-credits.ts), with the number renewal email's lease and sent/rejected marks (0031).
ALTER TABLE calls ADD COLUMN low_credit_at INTEGER;
ALTER TABLE calls ADD COLUMN low_credit_deadline_at INTEGER;
ALTER TABLE calls ADD COLUMN low_credit_minutes INTEGER;
ALTER TABLE calls ADD COLUMN low_credit_email_sent_at INTEGER;
ALTER TABLE calls ADD COLUMN low_credit_email_rejected_at INTEGER;
ALTER TABLE calls ADD COLUMN low_credit_email_claim_until INTEGER;
CREATE INDEX calls_low_credit_pending ON calls(low_credit_deadline_at) WHERE low_credit_deadline_at IS NOT NULL AND low_credit_email_sent_at IS NULL AND low_credit_email_rejected_at IS NULL;
