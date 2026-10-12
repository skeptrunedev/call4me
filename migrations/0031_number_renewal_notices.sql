-- One renewal warning per paid period. A lease lets another cron retry interrupted SMTP work.
-- The first attempt also guarantees already overdue numbers a day before release at rollout.
ALTER TABLE numbers ADD COLUMN renewal_notice_at INTEGER;
ALTER TABLE numbers ADD COLUMN renewal_email_sent_at INTEGER;
ALTER TABLE numbers ADD COLUMN renewal_email_rejected_at INTEGER;
ALTER TABLE numbers ADD COLUMN renewal_email_claim_until INTEGER;
