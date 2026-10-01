-- Why a call ended, so the user can tell a drop from a hang-up and which side did it.
-- hangup_source is Telnyx's view of the leg: 'caller' (us, on an outbound call), 'callee', or 'unknown'.
-- end_reason is set only when call4me itself hung up, and says why (the task was done, the user
-- asked, the time limit, lost audio).
ALTER TABLE calls ADD COLUMN hangup_source TEXT;
ALTER TABLE calls ADD COLUMN end_reason TEXT;
