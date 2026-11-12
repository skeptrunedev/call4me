-- When a call's audio first reached the voice session. A call answered without any (Telnyx
-- couldn't connect its media stream, so the business heard silence) ends as failed, unbilled.
ALTER TABLE calls ADD COLUMN audio_at INTEGER;
