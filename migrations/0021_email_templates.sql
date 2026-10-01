-- Copy for the lifecycle emails (services/drip.ts), editable without a deploy:
-- npm run template -- set <key> ... Placeholders {addCredits} and {host} are filled at send
-- time; a row with any other placeholder is ignored and the code default is used instead.
CREATE TABLE email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO email_templates (key, subject, body, updated_at) VALUES (
  'welcome',
  'welcome to Call for Me',
  'hey, I''m Nick, the creator of call4me. thank you so much for signing up! to get started, add credits at {addCredits} and paste the prompt from {host} into your agent.

If you reply with feedback, I''m happy to give you $25 in credits. Anything helps, including how you found it and why you signed up.

Here''s my cell # for imessage or whatsapp - 7379832612 .

- Nick',
  1790880000000
);
