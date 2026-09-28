-- Credits over x402 (GET /api): the payTo address is the Stripe crypto deposit address,
-- minted once per network and cached here. A settled payment is recorded as a Stripe
-- PaymentIntent and credited to the account through the ledger (ref "x402:<tx hash>").
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
