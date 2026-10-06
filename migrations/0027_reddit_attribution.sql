-- First-party Reddit Ads attribution. A visit is what call4me recorded after the landing page
-- loaded; it stays separate from Reddit's own click/view attribution and reporting windows.
CREATE TABLE reddit_visits (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  rdt_cid TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_group_id TEXT,
  ad_group_name TEXT,
  audience TEXT,
  ad_id TEXT,
  ad_name TEXT,
  creative_id TEXT,
  creative_name TEXT,
  landing TEXT NOT NULL,
  referrer_host TEXT,
  ip_address TEXT,
  user_agent TEXT,
  visited_at INTEGER NOT NULL
);
CREATE INDEX reddit_visits_account ON reddit_visits(account_id, visited_at);
CREATE INDEX reddit_visits_click ON reddit_visits(rdt_cid);

-- First paid Reddit visit is immutable acquisition; latest is updated by later paid visits.
ALTER TABLE accounts ADD COLUMN reddit_first_visit_id TEXT REFERENCES reddit_visits(id);
ALTER TABLE accounts ADD COLUMN reddit_last_visit_id TEXT REFERENCES reddit_visits(id);
ALTER TABLE topups ADD COLUMN reddit_visit_id TEXT REFERENCES reddit_visits(id);

-- Durable CAPI outbox and audit trail. payload contains only approved matching fields and event
-- metadata: never call numbers, destinations, briefs, transcripts, or task categories.
CREATE TABLE reddit_conversions (
  conversion_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  visit_id TEXT REFERENCES reddit_visits(id),
  event_name TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  event_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'blocked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_http_status INTEGER,
  last_error TEXT,
  last_response TEXT,
  last_attempt_at INTEGER,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(event_name, source_ref)
);
CREATE INDEX reddit_conversions_status ON reddit_conversions(status, event_at);

-- Optional spend import/API sync target, in micros to preserve Reddit's reported precision.
CREATE TABLE reddit_ad_spend (
  date TEXT NOT NULL,
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign_name TEXT,
  ad_group_id TEXT NOT NULL DEFAULT '',
  ad_group_name TEXT,
  ad_id TEXT NOT NULL DEFAULT '',
  ad_name TEXT,
  creative_id TEXT NOT NULL DEFAULT '',
  creative_name TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  spend_micros INTEGER NOT NULL,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (date, campaign_id, ad_group_id, ad_id, creative_id)
);
