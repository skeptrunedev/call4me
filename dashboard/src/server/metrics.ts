import type { AccountRow, CallRow, Cohort, CreditRow, CreditStatus, Day, LedgerRow, Metrics, RedditAttributionRow, RedditConversionRow, RedditSpendRow, RedditVisitRow, TopupRow, UserRow } from "../shared/types";

const DAY = 24 * 60 * 60 * 1000;
const COHORT_DAYS = 7;
// Stripe statuses that still charge: the reload renews (past_due is retrying the card).
const LIVE_RELOAD = new Set(["active", "trialing", "past_due"]);
// Below this, a user has to buy more (or their reload has to land) before the next call of any length.
const LOW_BALANCE_CENTS = 200;

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The same moment one calendar month earlier, as Stripe bills monthly plans. */
function monthBefore(ms: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.getTime();
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function group<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/**
 * Product metrics for real users. Internal accounts are left out entirely. "Active" means placing an
 * outbound call; inbound calls are businesses calling back, not something the user did.
 */
export function computeMetrics(
  input: { accounts: AccountRow[]; topups: TopupRow[]; calls: CallRow[]; ledger: LedgerRow[]; redditVisits?: RedditVisitRow[]; redditSpend?: RedditSpendRow[]; redditConversions?: RedditConversionRow[] },
  internalEmails: Set<string>,
  now: number,
): Metrics {
  const accounts = input.accounts.filter((a) => !internalEmails.has((a.email ?? "").toLowerCase()));
  const ids = new Set(accounts.map((a) => a.id));
  const topups = input.topups.filter((t) => ids.has(t.account_id));
  const calls = input.calls.filter((c) => ids.has(c.account_id) && c.direction === "outbound");
  const ledger = new Map(input.ledger.map((l) => [l.account_id, l]));
  const topupsBy = group(topups, (t) => t.account_id);
  const callsBy = group(calls, (c) => c.account_id);

  const activeDays = (id: string) => new Set((callsBy.get(id) ?? []).map((c) => utcDate(c.created_at)));
  const activated = accounts.filter((a) => callsBy.has(a.id));
  const returning = activated.filter((a) => activeDays(a.id).size >= 2);
  const paying = accounts.filter((a) => topupsBy.has(a.id));
  const monthlyLive = accounts.filter((a) => a.reload_status && LIVE_RELOAD.has(a.reload_status));
  const firstPaid = (id: string) => Math.min(...topupsBy.get(id)!.map((t) => t.paid_at));

  const summary: Metrics["summary"] = {
    users: accounts.length,
    paying: paying.length,
    activated: activated.length,
    returning: returning.length,
    activeLast7: new Set(calls.filter((c) => now - c.created_at < 7 * DAY).map((c) => c.account_id)).size,
    grossCents: topups.reduce((s, t) => s + t.amount_cents, 0),
    mrrCents: monthlyLive.reduce((s, a) => s + (a.reload_cents ?? 0), 0),
    monthlyPlans: monthlyLive.length,
    cancelledPlans: accounts.filter((a) => a.reload_status === "canceled").length,
    repeatBuyers: paying.filter((a) => topupsBy.get(a.id)!.length >= 2).length,
    spentCents: calls.reduce((s, c) => s + (c.cost_cents ?? 0), 0),
    medianMinutesToPay: median(paying.map((a) => Math.max(0, firstPaid(a.id) - a.created_at) / 60000)),
  };

  const funnel = [
    { label: "Signed up", users: accounts.length },
    { label: "Paid", users: paying.length },
    { label: "Placed a call", users: activated.length },
    { label: "Called on 2+ days", users: returning.length },
  ];

  const outcomeCounts = new Map<string, number>();
  for (const c of calls) {
    const result = c.status === "completed" ? (c.result ?? "no recap") : c.status;
    outcomeCounts.set(result, (outcomeCounts.get(result) ?? 0) + 1);
  }
  const outcomes = [...outcomeCounts].map(([result, n]) => ({ result, calls: n })).sort((a, b) => b.calls - a.calls);

  const days: Day[] = [];
  if (accounts.length) {
    const start = Date.parse(utcDate(Math.min(...accounts.map((a) => a.created_at))));
    const signupsOn = group(accounts, (a) => utcDate(a.created_at));
    const payersOn = group(paying, (a) => utcDate(firstPaid(a.id)));
    const topupsOn = group(topups, (t) => utcDate(t.paid_at));
    const callsOn = group(calls, (c) => utcDate(c.created_at));
    for (let t = start; t <= now; t += DAY) {
      const date = utcDate(t);
      const dayCalls = callsOn.get(date) ?? [];
      days.push({
        date,
        signups: signupsOn.get(date)?.length ?? 0,
        newPaying: payersOn.get(date)?.length ?? 0,
        revenueCents: (topupsOn.get(date) ?? []).reduce((s, x) => s + x.amount_cents, 0),
        activeCallers: new Set(dayCalls.map((c) => c.account_id)).size,
        calls: dayCalls.length,
        minutes: Math.round(dayCalls.reduce((s, c) => s + (c.billed_seconds ?? 0), 0) / 60),
        doneCalls: dayCalls.filter((c) => c.result === "done").length,
      });
    }
  }

  const cohorts: Cohort[] = [...group(accounts, (a) => utcDate(a.created_at))]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, members]) => ({
      date,
      size: members.length,
      days: Array.from({ length: COHORT_DAYS }, (_, n) => {
        const eligible = members.filter((m) => now >= m.created_at + (n + 1) * DAY);
        if (!eligible.length) return null;
        const active = eligible.filter((m) =>
          (callsBy.get(m.id) ?? []).some((c) => c.created_at >= m.created_at + n * DAY && c.created_at < m.created_at + (n + 1) * DAY),
        ).length;
        return { active, eligible: eligible.length };
      }),
    }));

  const users: UserRow[] = accounts
    .map((a) => {
      const own = callsBy.get(a.id) ?? [];
      const paid = topupsBy.get(a.id) ?? [];
      return {
        email: a.email ?? a.id,
        signedUpAt: a.created_at,
        paidCents: paid.reduce((s, t) => s + t.amount_cents, 0),
        monthly: paid.some((t) => t.monthly),
        grantedCents: ledger.get(a.id)?.granted_cents ?? 0,
        balanceCents: ledger.get(a.id)?.balance_cents ?? 0,
        calls: own.length,
        activeDays: activeDays(a.id).size,
        lastCallAt: own.length ? Math.max(...own.map((c) => c.created_at)) : null,
      };
    })
    .sort((a, b) => b.signedUpAt - a.signedUpAt);

  const credits: CreditRow[] = paying.map((a) => {
    const l = ledger.get(a.id);
    const own = callsBy.get(a.id) ?? [];
    const live = !!a.reload_status && LIVE_RELOAD.has(a.reload_status) && !!a.reload_renews_at;
    const plan: CreditRow["plan"] = live ? "monthly" : a.reload_status === "canceled" ? "cancelled" : "one-time";
    // A monthly plan's period is the month before its scheduled renewal; anything else gets 30 days from its latest purchase.
    const periodEnd = live ? a.reload_renews_at! : Math.max(...topupsBy.get(a.id)!.map((t) => t.paid_at)) + 30 * DAY;
    const periodStart = live ? monthBefore(periodEnd) : periodEnd - 30 * DAY;
    const creditsCents = (l?.funded_cents ?? 0) + (l?.granted_cents ?? 0);
    const spentCents = l?.spent_cents ?? 0;
    const balanceCents = l?.balance_cents ?? 0;
    const usedPct = creditsCents ? Math.min(100, (spentCents / creditsCents) * 100) : 0;
    const elapsedPct = Math.min(100, Math.max(0, ((now - periodStart) / (periodEnd - periodStart)) * 100));
    const status: CreditStatus =
      plan === "cancelled"
        ? "cancelled"
        : spentCents === 0
          ? "not started"
          : balanceCents < LOW_BALANCE_CENTS
            ? "running low"
            : usedPct >= elapsedPct
              ? "on pace"
              : "behind";
    return {
      email: a.email ?? a.id,
      plan,
      periodEnd,
      creditsCents,
      spentCents,
      balanceCents,
      usedPct,
      elapsedPct,
      calls: own.length,
      lastCallAt: own.length ? Math.max(...own.map((c) => c.created_at)) : null,
      status,
    };
  });

  const redditVisits = (input.redditVisits ?? []).filter((v) => !v.account_id || ids.has(v.account_id));
  const redditConversions = input.redditConversions ?? [];
  const visitsById = new Map(redditVisits.map((v) => [v.id, v]));
  const visitKey = (v: Pick<RedditVisitRow, "campaign_id" | "campaign_name" | "ad_group_id" | "ad_group_name" | "audience" | "ad_id" | "ad_name" | "creative_id" | "creative_name">) =>
    [v.campaign_id || v.campaign_name || "(campaign unknown)", v.ad_group_id || v.ad_group_name || v.audience || "(audience unknown)", v.ad_id || v.ad_name || "(ad unknown)", v.creative_id || v.creative_name || "(creative unknown)"].join("\u001f");
  const label = (name: string | null, id: string | null, fallback: string) => name || id || fallback;
  const rows = new Map<string, RedditAttributionRow>();
  const rowFor = (v: Pick<RedditVisitRow, "campaign_id" | "campaign_name" | "ad_group_id" | "ad_group_name" | "audience" | "ad_id" | "ad_name" | "creative_id" | "creative_name">) => {
    const key = visitKey(v);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        campaign: label(v.campaign_name, v.campaign_id, "(campaign unknown)"),
        audience: label(v.ad_group_name || v.audience, v.ad_group_id, "(audience unknown)"),
        ad: label(v.ad_name, v.ad_id, "(ad unknown)"),
        creative: label(v.creative_name, v.creative_id, "(creative unknown)"),
        recordedVisits: 0,
        visitors: 0,
        spendCents: 0,
        newPayingCustomers: 0,
        callingCustomers: 0,
        repeatPurchasers: 0,
        repeatUsers: 0,
        completedCalls: 0,
        resolvedTasks: 0,
        cacCents: null,
      };
      rows.set(key, row);
    }
    return row;
  };
  const visitorsByRow = new Map<string, Set<string>>();
  for (const visit of redditVisits) {
    const row = rowFor(visit);
    row.recordedVisits++;
    const visitors = visitorsByRow.get(row.key) ?? new Set<string>();
    visitors.add(visit.visitor_id);
    visitorsByRow.set(row.key, visitors);
  }
  for (const spend of input.redditSpend ?? []) {
    const existing = [...rows.values()].find((row) => {
      const parts = row.key.split("\u001f");
      return (!spend.campaign_id || parts[0] === spend.campaign_id) && (!spend.ad_group_id || parts[1] === spend.ad_group_id) && (!spend.ad_id || parts[2] === spend.ad_id) && (!spend.creative_id || parts[3] === spend.creative_id);
    });
    (existing ?? rowFor({ ...spend, audience: null })).spendCents += Math.round(spend.spend_micros / 10_000);
  }
  for (const account of accounts) {
    const visit = account.reddit_first_visit_id ? visitsById.get(account.reddit_first_visit_id) : null;
    if (!visit) continue;
    const row = rowFor(visit);
    const paid = topupsBy.get(account.id) ?? [];
    const ownCalls = callsBy.get(account.id) ?? [];
    if (paid.length) row.newPayingCustomers++;
    if (ownCalls.length) row.callingCustomers++;
    if (paid.length >= 2) row.repeatPurchasers++;
    if (activeDays(account.id).size >= 2) row.repeatUsers++;
    row.completedCalls += ownCalls.filter((call) => call.status === "completed").length;
    row.resolvedTasks += ownCalls.filter((call) => call.result === "done").length;
  }
  for (const [key, visitors] of visitorsByRow) rows.get(key)!.visitors = visitors.size;
  for (const row of rows.values()) row.cacCents = row.newPayingCustomers ? Math.round(row.spendCents / row.newPayingCustomers) : null;
  const statusCount = (status: RedditConversionRow["status"]) => redditConversions.filter((c) => c.status === status).length;
  const reddit = {
    recordedVisits: redditVisits.length,
    visitors: new Set(redditVisits.map((v) => v.visitor_id)).size,
    attributedAccounts: accounts.filter((a) => a.reddit_first_visit_id && visitsById.has(a.reddit_first_visit_id)).length,
    spendCents: [...rows.values()].reduce((sum, row) => sum + row.spendCents, 0),
    deliveries: { sent: statusCount("sent"), pending: statusCount("pending"), failed: statusCount("failed"), blocked: statusCount("blocked") },
    rows: [...rows.values()].sort((a, b) => b.spendCents - a.spendCents || b.newPayingCustomers - a.newPayingCustomers || b.recordedVisits - a.recordedVisits),
    recentConversions: [...redditConversions].sort((a, b) => b.event_at - a.event_at).slice(0, 50),
  };

  return { generatedAt: now, summary, funnel, outcomes, days, cohorts, users, credits, reddit };
}
