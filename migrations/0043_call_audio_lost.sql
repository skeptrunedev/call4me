-- When an answered call's audio stream dropped and had not come back. A call that ends that way
-- (the business hung up on silence, or the reattach never connected) ends as failed, unbilled.
ALTER TABLE calls ADD COLUMN audio_lost_at INTEGER;
