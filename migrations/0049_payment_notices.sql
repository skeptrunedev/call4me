-- One row per payment (a topup or reload in the ledger) Nick has been emailed about
-- (services/payments.ts). Payments that exist now are marked as already announced, so only
-- payments from here on send an email. The index keeps the every-minute look for new ones to the
-- payments, not the whole ledger.
CREATE TABLE payment_notices (
  ledger_id TEXT PRIMARY KEY REFERENCES ledger(id),
  sent_at INTEGER NOT NULL
);
CREATE INDEX ledger_kind ON ledger(kind, created_at);
INSERT INTO payment_notices (ledger_id, sent_at) SELECT id, created_at FROM ledger WHERE kind IN ('topup', 'reload');
