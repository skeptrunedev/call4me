-- Voice Worker deploys (scripts/deploy-voice.sh): while locked_until is ahead, new calls wait
-- before dialing or answering, so a deploy never lands on a call that is starting up.
CREATE TABLE voice_deploys (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  locked_until INTEGER NOT NULL
);
