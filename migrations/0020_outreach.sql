-- People we pitch call4me to (creators, press), and where each conversation stands
-- (scripts/outreach.mjs). One row per person. The channel to use is the first contact we have:
-- an X handle, then an email, then anything else (other_contact).
CREATE TABLE outreach (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('creator', 'press')),
  platform TEXT,                       -- where their audience is: youtube, tiktok, instagram, newsletter, podcast, outlet, blog
  audience TEXT,                       -- e.g. '16.5K subs', as researched
  profile_url TEXT,
  x_handle TEXT,                       -- without the @
  email TEXT,
  other_contact TEXT,                  -- a URL or a short note when there is no X or email
  notes TEXT,                          -- why they fit
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'drafted', 'sent', 'replied', 'won', 'declined', 'no_contact')),
  message TEXT,                        -- the draft, then what was sent
  sent_via TEXT CHECK (sent_via IN ('x', 'email', 'other')),
  sent_at INTEGER,
  replied_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX outreach_name ON outreach(name, kind);
CREATE INDEX outreach_status ON outreach(status, updated_at);
