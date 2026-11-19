-- Whether call4me answers calls to the account's numbers (services/dialer.ts, answerInbound). On by
-- default; turned off on the account page, every incoming call gets a busy signal before anything is
-- held or written. Vlad asked for it (Nov 18): calling from his own verified number, he didn't need
-- the free number answering, and a robocaller that stayed on the line would be billed to him.
ALTER TABLE accounts ADD COLUMN answer_calls INTEGER NOT NULL DEFAULT 1;
