-- Each callbay account belongs to one signed-in user (Google or X). Accounts made before
-- sign-in existed are linked by email on that person's first sign-in.
ALTER TABLE accounts ADD COLUMN user_id TEXT REFERENCES "user"(id);
CREATE UNIQUE INDEX accounts_user ON accounts(user_id);
