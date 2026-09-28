-- The blog's supporter tier: a monthly Stripe subscription that unlocks paid posts. Keyed by
-- callbay account; the Stripe objects carry metadata app=callbay, kind=supporter, account_id
-- (never client_reference_id or user_id, which skillbay's webhook on the same Stripe account reads).
CREATE TABLE supporters (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,                -- Stripe's subscription status (active, trialing, past_due, canceled, ...)
  current_period_end INTEGER,          -- ms; access lasts until here even when canceled
  checked_at INTEGER NOT NULL,         -- last time the status was confirmed with Stripe
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
