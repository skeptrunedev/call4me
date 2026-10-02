// Rows read from the callbay D1 database (all times are ms since epoch).
export interface AccountRow {
  id: string;
  email: string | null;
  created_at: number;
}
export interface TopupRow {
  account_id: string;
  amount_cents: number;
  paid_at: number;
  monthly: number;
}
export interface CallRow {
  account_id: string;
  created_at: number;
  direction: string;
  status: string;
  billed_seconds: number | null;
  cost_cents: number | null;
  result: string | null;
}
export interface LedgerRow {
  account_id: string;
  balance_cents: number;
  granted_cents: number;
}

export interface Day {
  date: string;
  signups: number;
  newPaying: number;
  revenueCents: number;
  activeCallers: number;
  calls: number;
  minutes: number;
  doneCalls: number;
}

export interface Cohort {
  date: string;
  size: number;
  /** Day N after signup: share of the users whose day N has fully passed who placed a call in it. null until one has. */
  days: ({ active: number; eligible: number } | null)[];
}

export interface UserRow {
  email: string;
  signedUpAt: number;
  paidCents: number;
  monthly: boolean;
  grantedCents: number;
  balanceCents: number;
  calls: number;
  activeDays: number;
  lastCallAt: number | null;
}

export interface Metrics {
  generatedAt: number;
  summary: {
    users: number;
    paying: number;
    activated: number;
    returning: number;
    activeLast7: number;
    grossCents: number;
    mrrCents: number;
    monthlyPlans: number;
    repeatBuyers: number;
    spentCents: number;
    medianMinutesToPay: number | null;
  };
  funnel: { label: string; users: number }[];
  outcomes: { result: string; calls: number }[];
  days: Day[];
  cohorts: Cohort[];
  users: UserRow[];
}
