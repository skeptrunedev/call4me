-- Blog engagement and the newsletter: likes (one per reader), comments, subscribers with
-- double opt-in, and a record of which posts were mailed out.
CREATE TABLE blog_likes (
  post_slug TEXT NOT NULL,
  reader TEXT NOT NULL,          -- opaque id from the cb_reader cookie
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_slug, reader)
);

CREATE TABLE blog_comments (
  id TEXT PRIMARY KEY,
  post_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,           -- never shown
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'removed')),
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX blog_comments_post ON blog_comments(post_slug, status, created_at);
CREATE INDEX blog_comments_ip ON blog_comments(ip, created_at);

CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'active', 'unsubscribed')),
  token TEXT NOT NULL,           -- confirms and unsubscribes
  ip TEXT,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER
);
CREATE INDEX subscribers_status ON subscribers(status);
CREATE INDEX subscribers_token ON subscribers(token);

CREATE TABLE blog_sends (
  post_slug TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL,
  recipients INTEGER NOT NULL
);
