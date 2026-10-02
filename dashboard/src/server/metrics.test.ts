import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-01T10:00:00Z");
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
      { id: "a", email: "a@x.com", created_at: T0 },
      { id: "b", email: "b@x.com", created_at: T0 + 1000 },
      { id: "me", email: "Me@Skeptrune.com", created_at: T0 },
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
    ledger: [{ account_id: "a", balance_cents: 950, granted_cents: 0 }],
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

  it("counts a monthly plan toward MRR and times signup to payment", () => {
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
