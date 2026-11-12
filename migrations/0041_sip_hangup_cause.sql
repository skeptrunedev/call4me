-- The far end's own SIP answer to an unanswered call (486 Busy Here, 603 Decline, 604 Does Not
-- Exist...). Telnyx's hangup_cause folds all three into 'user_busy', so it alone can't tell a busy
-- line from one that rejects us or a number that doesn't exist.
ALTER TABLE calls ADD COLUMN sip_hangup_cause TEXT;
