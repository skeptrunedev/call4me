// Rows read from the callbay D1 database (all times are ms since epoch).
export interface AccountRow {
  id: string;
  email: string | null;
  created_at: number;
  /** The account's monthly reload, synced from Stripe: active, canceled, past_due, ... */
  reload_status: string | null;
  reload_cents: number | null;
  reload_renews_at: number | null;
  reddit_attribution?: string | null;
  reddit_last_touch?: string | null;
}
export interface TopupRow {
  account_id: string;
  amount_cents: number;
  paid_at: number;
  monthly: number;
}
export interface CallRow {
  id?: string;
  account_id: string;
  created_at: number;
  direction: string;
  status: string;
  billed_seconds: number | null;
  cost_cents: number | null;
  result: string | null;
  answered_at?: number | null;
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
  reddit: RedditMetrics;
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
}

export interface RedditVisitRow {
  id: string;
  visitor_id: string;
  account_id: string | null;
  campaign: string | null;
  ad_group: string | null;
  ad_id: string | null;
  audience: string | null;
  creative: string | null;
  at: number;
}
export interface RedditPaymentRow {
  id: string;
  account_id: string;
  paid_at: number;
  paid_amount_cents: number | null;
  kind: string;
}
export interface RedditPaidHistoryRow { account_id: string; paid_at: number }
export interface RedditDeliveryRow { event_name: string; state: string; count: number; account_id?: string }
export interface RedditDeliveryStatusRow { configured: number; checked_at: number }
export interface RedditGroup {
  campaign: string | null;
  audience: string | null;
  creative: string | null;
  adGroup: string | null;
  adId: string | null;
  visitors: number;
  acquiredAccounts: number;
  firstPaying: number;
  paidCallers: number;
  successfulCallers: number;
  successfulTasks: number;
  returningPaidCallers: number;
  returningEligible: number;
  matureReturningPaidCallers: number;
  repeatBuyers: number;
  revenueCents: number | null;
  unknownPayments: number;
}
export interface RedditMetrics {
  state: "ready" | "awaiting migration";
  summary: Omit<RedditGroup, "campaign" | "audience" | "creative" | "adGroup" | "adId">;
  groups: RedditGroup[];
  reengagedAccounts: number;
  invalidAttributions: number;
  metadataPendingAccounts: number;
  delivery: RedditDeliveryRow[];
  conversionConfigured: boolean | null;
  conversionCheckedAt: number | null;
  spendState: "not connected";
}
