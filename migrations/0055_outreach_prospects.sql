-- The outreach tracker also holds B2B prospects (Nick, Nov 27): founders of small AI-native
-- service companies we email about using call4me in their own operations. SQLite can't change a
-- CHECK constraint in place, so the table is rebuilt with 'prospect' added to kind; every other
-- column, constraint and index is unchanged.
CREATE TABLE outreach_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('creator', 'press', 'prospect')),
  platform TEXT,
  audience TEXT,
  profile_url TEXT,
  x_handle TEXT,
  email TEXT,
  other_contact TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'drafted', 'sent', 'replied', 'won', 'declined', 'no_contact')),
  message TEXT,
  sent_via TEXT CHECK (sent_via IN ('x', 'email', 'other')),
  sent_at INTEGER,
  replied_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO outreach_new (id, name, kind, platform, audience, profile_url, x_handle, email, other_contact,
                          notes, status, message, sent_via, sent_at, replied_at, created_at, updated_at)
SELECT id, name, kind, platform, audience, profile_url, x_handle, email, other_contact,
       notes, status, message, sent_via, sent_at, replied_at, created_at, updated_at
FROM outreach;

DROP TABLE outreach;
ALTER TABLE outreach_new RENAME TO outreach;

CREATE UNIQUE INDEX outreach_name ON outreach(name, kind);
CREATE INDEX outreach_status ON outreach(status, updated_at);
