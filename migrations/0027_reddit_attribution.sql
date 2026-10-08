-- Paid Reddit touches stay attached to the account after its agent leaves the browser.
ALTER TABLE accounts ADD COLUMN reddit_attribution TEXT;
ALTER TABLE accounts ADD COLUMN reddit_last_touch TEXT;
ALTER TABLE topups ADD COLUMN reddit_attribution TEXT;
ALTER TABLE topups ADD COLUMN paid_amount_cents INTEGER;

CREATE TABLE reddit_visits (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  click_id TEXT,
  campaign TEXT,
  ad_group TEXT,
  ad_id TEXT,
  audience TEXT,
  creative TEXT,
  landing TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX reddit_visits_account ON reddit_visits(account_id, at);
CREATE INDEX reddit_visits_visitor ON reddit_visits(visitor_id, at);

-- Actual cash paid, including automatic reloads. Credits' face value can differ after discounts.
CREATE TABLE reddit_payments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  paid_at INTEGER NOT NULL,
  paid_amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('checkout', 'reload'))
);
CREATE INDEX reddit_payments_account ON reddit_payments(account_id, paid_at);

-- An outbox survives restarts and failed requests. Business ids prevent duplicate enqueue.
CREATE TABLE reddit_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  event_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  delivered_at INTEGER,
  last_status INTEGER,
  last_error TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'delivered', 'failed'))
);
CREATE INDEX reddit_events_pending ON reddit_events(state, next_attempt_at);

CREATE TABLE reddit_delivery_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  configured INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);
