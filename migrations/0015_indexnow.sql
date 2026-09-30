-- IndexNow (services/indexnow.ts): each sitemap URL with the lastmod we last announced, so the
-- cron pings search engines only for pages that are new or changed since.
CREATE TABLE indexnow_sent (
  url TEXT PRIMARY KEY,
  lastmod TEXT NOT NULL,   -- the sitemap lastmod when sent; '' for pages without one
  sent_at INTEGER NOT NULL
);
