-- An incoming call that picks up an earlier outbound call's unfinished task (a business calling
-- back after a voicemail). Its outcome settles that task.
ALTER TABLE calls ADD COLUMN callback_for TEXT REFERENCES calls(id);
CREATE INDEX calls_callback_for ON calls(callback_for);
