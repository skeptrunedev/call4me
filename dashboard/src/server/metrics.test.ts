import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import type { AccountRow } from "../shared/types";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-01T10:00:00Z");
type Reload = Pick<AccountRow, "reload_status" | "reload_cents" | "reload_renews_at">;
const noReload: Reload = { reload_status: null, reload_cents: null, reload_renews_at: null };
const call = (account_id: string, created_at: number, extra: Partial<{ direction: string; status: string; result: string | null }> = {}) => ({
  account_id,
  created_at,
  direction: "outbound",
  status: "completed",
  billed_seconds: 60,
  cost_cents: 25,
  result: "done",
  ...extra,
});

describe("computeMetrics", () => {
  const input = {
    accounts: [
      { id: "a", email: "a@x.com", created_at: T0, reload_status: "active", reload_cents: 1000, reload_renews_at: Date.parse("2026-11-01T10:00:00Z") },
      { id: "b", email: "b@x.com", created_at: T0 + 1000, ...noReload },
      { id: "me", email: "Me@Skeptrune.com", created_at: T0, reload_status: "active", reload_cents: 9900, reload_renews_at: T0 + 30 * DAY },
    ],
    topups: [
      { account_id: "a", amount_cents: 1000, paid_at: T0 + 5 * 60000, monthly: 1 },
      { account_id: "me", amount_cents: 5000, paid_at: T0, monthly: 0 },
    ],
    calls: [
      call("a", T0 + 60000),
      call("a", T0 + DAY + 60000, { result: "partial" }),
      call("b", T0 + 2000, { direction: "inbound" }),
      call("b", T0 + 3000, { status: "no_answer", result: null }),
      call("me", T0 + DAY * 2),
    ],
    ledger: [{ account_id: "a", balance_cents: 950, granted_cents: 0, funded_cents: 1000, spent_cents: 50 }],
  };
  const m = computeMetrics(input, new Set(["me@skeptrune.com"]), T0 + 2 * DAY + 5000);

  it("leaves internal accounts out of everything", () => {
    expect(m.summary.users).toBe(2);
    expect(m.summary.grossCents).toBe(1000);
    expect(m.users.map((u) => u.email)).toEqual(["b@x.com", "a@x.com"]);
  });

  it("counts only outbound calls as activity and callers on 2+ days as returning", () => {
    expect(m.summary.activated).toBe(2);
    expect(m.summary.returning).toBe(1);
    expect(m.outcomes).toEqual([
      { result: "done", calls: 1 },
      { result: "partial", calls: 1 },
      { result: "no_answer", calls: 1 },
    ]);
  });

  it("counts live monthly reloads toward MRR and times signup to payment", () => {
    expect(m.summary.mrrCents).toBe(1000);
    expect(m.summary.medianMinutesToPay).toBe(5);
  });

  it("fills cohort cells only for days that have fully passed", () => {
    const [cohort] = m.cohorts;
    expect(cohort.size).toBe(2);
    expect(cohort.days[0]).toEqual({ active: 2, eligible: 2 });
    expect(cohort.days[1]).toEqual({ active: 1, eligible: 2 });
    expect(cohort.days[2]).toBeNull();
  });
});

describe("credit burn", () => {
  const renews = Date.parse("2026-11-01T10:00:00Z");
  const now = T0 + 3 * DAY; // 3 of October's 31 days into the month: ~9.7% elapsed
  const account = (id: string, reload: Partial<Reload> = {}) => ({ id, email: `${id}@x.com`, created_at: T0, ...noReload, ...reload });
  const paid = (account_id: string) => ({ account_id, amount_cents: 1000, paid_at: T0, monthly: 1 });
  const ledger = (account_id: string, spent: number) => ({ account_id, balance_cents: 1000 - spent, granted_cents: 0, funded_cents: 1000, spent_cents: spent });
  const m = computeMetrics(
    {
      accounts: [
        account("pace", { reload_status: "active", reload_cents: 1000, reload_renews_at: renews }),
        account("slow", { reload_status: "active", reload_cents: 1000, reload_renews_at: renews }),
        account("idle", { reload_status: "active", reload_cents: 1000, reload_renews_at: renews }),
        account("low", { reload_status: "past_due", reload_cents: 1000, reload_renews_at: renews }),
        account("gone", { reload_status: "canceled", reload_cents: 1000, reload_renews_at: renews }),
        account("once"),
      ],
      topups: ["pace", "slow", "idle", "low", "gone", "once"].map(paid),
      calls: [],
      ledger: [ledger("pace", 200), ledger("slow", 50), ledger("idle", 0), ledger("low", 900), ledger("gone", 500), ledger("once", 100)],
    },
    new Set(),
    now,
  );
  const status = Object.fromEntries(m.credits.map((c) => [c.email.split("@")[0], c.status]));

  it("compares credits used with how far into the billing month a user is", () => {
    expect(status).toEqual({ pace: "on pace", slow: "behind", idle: "not started", low: "running low", gone: "cancelled", once: "on pace" });
    const pace = m.credits.find((c) => c.email.startsWith("pace"))!;
    expect(pace.usedPct).toBe(20);
    expect(pace.elapsedPct).toBeCloseTo((3 / 31) * 100, 5);
  });

  it("counts MRR from live reloads only, and cancelled plans separately", () => {
    expect(m.summary.mrrCents).toBe(4000);
    expect(m.summary.monthlyPlans).toBe(4);
    expect(m.summary.cancelledPlans).toBe(1);
  });
});

describe("Reddit attribution", () => {
  it("keeps recorded first-touch cohorts separate and reports completion apart from resolution", () => {
    const m = computeMetrics(
      {
        accounts: [{ id: "r", email: "r@x.com", created_at: T0, reddit_first_visit_id: "rv1", reddit_last_visit_id: "rv2", ...noReload }],
        topups: [
          { account_id: "r", amount_cents: 1000, paid_at: T0 + 1000, monthly: 0, reddit_visit_id: "rv1" },
          { account_id: "r", amount_cents: 1000, paid_at: T0 + DAY, monthly: 0, reddit_visit_id: "rv2" },
        ],
        calls: [call("r", T0 + 2000), call("r", T0 + DAY + 2000, { result: "partial" })],
        ledger: [],
        redditVisits: [
          { id: "rv1", visitor_id: "v1", account_id: "r", campaign_id: "c1", campaign_name: "launch", ad_group_id: "g1", ad_group_name: "Claude Code", audience: "Claude Code", ad_id: "a1", ad_name: "demo", creative_id: "cr1", creative_name: "demo-a", visited_at: T0 },
          { id: "rv2", visitor_id: "v1", account_id: "r", campaign_id: "c2", campaign_name: "retarget", ad_group_id: "g2", ad_group_name: "Visitors", audience: "Visitors", ad_id: "a2", ad_name: "return", creative_id: "cr2", creative_name: "return-a", visited_at: T0 + DAY },
        ],
        redditSpend: [{ campaign_id: "c1", campaign_name: "launch", ad_group_id: "g1", ad_group_name: "Claude Code", ad_id: "a1", ad_name: "demo", creative_id: "cr1", creative_name: "demo-a", spend_micros: 5_000_000 }],
        redditConversions: [{ conversion_id: "purchase:1", event_name: "PURCHASE", status: "sent", attempts: 1, last_http_status: 200, last_error: null, last_attempt_at: T0, delivered_at: T0, event_at: T0 }],
      },
      new Set(),
      T0 + 2 * DAY,
    );
    const launch = m.reddit.rows.find((row) => row.campaign === "launch")!;
    expect(launch).toMatchObject({ spendCents: 500, newPayingCustomers: 1, callingCustomers: 1, repeatPurchasers: 1, repeatUsers: 1, completedCalls: 2, resolvedTasks: 1, cacCents: 500 });
    expect(m.reddit).toMatchObject({ recordedVisits: 2, visitors: 1, attributedAccounts: 1, deliveries: { sent: 1, pending: 0, failed: 0, blocked: 0 } });
    expect(m.reddit.rows.find((row) => row.campaign === "retarget")?.newPayingCustomers).toBe(0);
  });
});
