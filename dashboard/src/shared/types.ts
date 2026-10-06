// Rows read from the callbay D1 database (all times are ms since epoch).
export interface AccountRow {
  id: string;
  email: string | null;
  created_at: number;
  /** The account's monthly reload, synced from Stripe: active, canceled, past_due, ... */
  reload_status: string | null;
  reload_cents: number | null;
  reload_renews_at: number | null;
  reddit_first_visit_id?: string | null;
  reddit_last_visit_id?: string | null;
}
export interface TopupRow {
  account_id: string;
  amount_cents: number;
  paid_at: number;
  monthly: number;
  reddit_visit_id?: string | null;
}

export interface RedditVisitRow {
  id: string;
  visitor_id: string;
  account_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_group_id: string | null;
  ad_group_name: string | null;
  audience: string | null;
  ad_id: string | null;
  ad_name: string | null;
  creative_id: string | null;
  creative_name: string | null;
  visited_at: number;
}

export interface RedditSpendRow {
  campaign_id: string;
  campaign_name: string | null;
  ad_group_id: string;
  ad_group_name: string | null;
  ad_id: string;
  ad_name: string | null;
  creative_id: string;
  creative_name: string | null;
  spend_micros: number;
}

export interface RedditConversionRow {
  conversion_id: string;
  event_name: string;
  status: "pending" | "sent" | "failed" | "blocked";
  attempts: number;
  last_http_status: number | null;
  last_error: string | null;
  last_attempt_at: number | null;
  delivered_at: number | null;
  event_at: number;
}

export interface RedditAttributionRow {
  key: string;
  campaign: string;
  audience: string;
  ad: string;
  creative: string;
  recordedVisits: number;
  visitors: number;
  spendCents: number;
  newPayingCustomers: number;
  callingCustomers: number;
  repeatPurchasers: number;
  repeatUsers: number;
  completedCalls: number;
  resolvedTasks: number;
  cacCents: number | null;
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
  /** Credits bought: top-ups and monthly reloads. */
  funded_cents: number;
  /** Credits used: calls and phone numbers, less refunds. Holds cancel out and aren't counted. */
  spent_cents: number;
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

export type CreditStatus = "cancelled" | "not started" | "behind" | "on pace" | "running low";

/** How fast a paying user is using their credits, against how far they are into their billing month. */
export interface CreditRow {
  email: string;
  plan: "monthly" | "cancelled" | "one-time";
  /** Monthly plans: the renewal Stripe has scheduled. Others: 30 days after their latest purchase. */
  periodEnd: number;
  creditsCents: number;
  spentCents: number;
  balanceCents: number;
  usedPct: number;
  elapsedPct: number;
  calls: number;
  lastCallAt: number | null;
  status: CreditStatus;
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
    cancelledPlans: number;
    repeatBuyers: number;
    spentCents: number;
    medianMinutesToPay: number | null;
  };
  funnel: { label: string; users: number }[];
  outcomes: { result: string; calls: number }[];
  days: Day[];
  cohorts: Cohort[];
  users: UserRow[];
  credits: CreditRow[];
  reddit: {
    recordedVisits: number;
    visitors: number;
    attributedAccounts: number;
    spendCents: number;
    deliveries: { sent: number; pending: number; failed: number; blocked: number };
    rows: RedditAttributionRow[];
    recentConversions: RedditConversionRow[];
  };
}
