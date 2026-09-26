-- One account per email. The API key is shown once and stored only as a SHA-256 hash.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  -- Who the caller says they are calling for ("Nick Khami"). Set by the agent per call if empty.
  display_name TEXT,
  key_hash TEXT UNIQUE,
  key_prefix TEXT,
  -- The account's own Telnyx number: every call goes out from it and callbacks come back to it.
  phone_number TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

-- Money in and out, in US cents. Balance = SUM(amount_cents). `ref` makes every entry idempotent.
CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('topup', 'call', 'refund', 'adjustment')),
  ref TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ledger_account ON ledger(account_id, created_at);

-- A Stripe Checkout session that adds funds. account_id is null until a first purchase is fulfilled.
CREATE TABLE topups (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  email TEXT,
  amount_cents INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded')),
  -- The success page mints the first API key once, for the purchase that created the account.
  key_revealed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE TABLE calls (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  -- The other side's number (the business we called, or whoever called us back).
  to_number TEXT NOT NULL,
  from_number TEXT,
  business TEXT NOT NULL,
  goal TEXT NOT NULL,
  -- JSON: { on_behalf_of, facts, flexibility, callback_number, max_minutes }
  brief TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'dialing', 'in_progress', 'completed', 'no_answer', 'busy', 'failed', 'canceled')),
  telnyx_call_control_id TEXT UNIQUE,
  answered_at INTEGER,
  ended_at INTEGER,
  billed_seconds INTEGER,
  cost_cents INTEGER,
  -- JSON from the voice agent's end_call: { result, summary, details }
  outcome TEXT,
  -- JSON array of { role: 'caller' | 'them', text, at }
  transcript TEXT,
  hangup_cause TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX calls_account ON calls(account_id, created_at);
CREATE INDEX calls_number ON calls(to_number, created_at);

-- Things the voice agent needed from the user mid-call. The coding agent answers through MCP.
CREATE TABLE call_questions (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL REFERENCES calls(id),
  question TEXT NOT NULL,
  answer TEXT,
  asked_at INTEGER NOT NULL,
  answered_at INTEGER
);
CREATE INDEX call_questions_call ON call_questions(call_id, asked_at);

-- Numbers we never dial: people who asked not to be called, plus anything an admin adds.
CREATE TABLE blocked_numbers (
  number TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Single-use links for getting a new API key by email.
CREATE TABLE key_resets (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
