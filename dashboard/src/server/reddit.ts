import type { AccountRow, CallRow, RedditDeliveryRow, RedditDeliveryStatusRow, RedditGroup, RedditMetrics, RedditPaidHistoryRow, RedditPaymentRow, RedditVisitRow } from "../shared/types";

const DAY = 86_400_000;
type Dimensions = Pick<RedditGroup, "campaign" | "audience" | "creative" | "adGroup" | "adId">;
type Touch = Dimensions & { at: number; visitorId: string };
export interface RedditInput {
  accounts: AccountRow[];
  calls: CallRow[];
  redditVisits?: RedditVisitRow[];
  redditPayments?: RedditPaymentRow[];
  redditPaidHistory?: RedditPaidHistoryRow[];
  redditDelivery?: RedditDeliveryRow[];
  redditDeliveryStatus?: RedditDeliveryStatusRow;
  redditReady?: boolean;
}
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
function touch(raw: string | null | undefined, now: number): Touch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !text(value.id) || !text(value.visitorId) || !Number.isFinite(value.at) || value.at <= 0 || value.at > now) return null;
    return { at: value.at, visitorId: value.visitorId, campaign: text(value.campaign), audience: text(value.audience), creative: text(value.creative), adGroup: text(value.adGroup), adId: text(value.adId) };
  } catch { return null; }
}
const empty = (): RedditMetrics["summary"] => ({ visitors: 0, acquiredAccounts: 0, firstPaying: 0, paidCallers: 0, successfulCallers: 0, successfulTasks: 0, returningPaidCallers: 0, returningEligible: 0, matureReturningPaidCallers: 0, repeatBuyers: 0, revenueCents: 0, unknownPayments: 0 });
const key = (d: Dimensions) => JSON.stringify([d.campaign, d.audience, d.creative, d.adGroup, d.adId]);
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];

/** First eligible paid touch assigns a customer once. Reloads remain in that acquisition cohort. */
export function computeReddit(input: RedditInput, internalEmails: Set<string>, now: number): RedditMetrics {
  const result: RedditMetrics = { state: input.redditReady ? "ready" : "awaiting migration", summary: empty(), groups: [], reengagedAccounts: 0, invalidAttributions: 0, metadataPendingAccounts: 0, delivery: [], conversionConfigured: null, conversionCheckedAt: null, spendState: "not connected" };
  if (!input.redditReady) return result;
  const internalIds = new Set(input.accounts.filter((a) => internalEmails.has((a.email ?? "").toLowerCase())).map((a) => a.id));
  const accounts = input.accounts.filter((a) => !internalIds.has(a.id));
  const ids = new Set(accounts.map((a) => a.id));
  const payments = unique(input.redditPayments ?? []).filter((p) => ids.has(p.account_id) && p.paid_at <= now);
  const history = [...(input.redditPaidHistory ?? []), ...payments.filter((p) => p.paid_amount_cents !== null && p.paid_amount_cents > 0)].filter((p) => ids.has(p.account_id) && Number.isFinite(p.paid_at) && p.paid_at <= now);
  const firstPaid = new Map<string, number>();
  for (const p of history) firstPaid.set(p.account_id, Math.min(firstPaid.get(p.account_id) ?? Infinity, p.paid_at));
  const calls = [...new Map(input.calls.map((c, i) => [c.id ?? `row${i}`, c])).values()].filter((c) => ids.has(c.account_id) && c.direction === "outbound" && c.status === "completed" && (c.billed_seconds ?? 0) > 0 && (c.cost_cents ?? 0) > 0 && c.created_at <= now);
  const groups = new Map<string, { row: RedditGroup; visitors: Set<string> }>();
  const allVisitors = new Set<string>();
  const get = (d: Dimensions) => {
    const k = key(d);
    if (!groups.has(k)) groups.set(k, { row: { ...d, ...empty() }, visitors: new Set() });
    return groups.get(k)!;
  };
  for (const v of unique(input.redditVisits ?? [])) {
    if (!v.visitor_id || !Number.isFinite(v.at) || v.at > now || (v.account_id && internalIds.has(v.account_id))) continue;
    const d = { campaign: text(v.campaign), audience: text(v.audience), creative: text(v.creative), adGroup: text(v.ad_group), adId: text(v.ad_id) };
    get(d).visitors.add(v.visitor_id);
    allVisitors.add(v.visitor_id);
  }
  for (const a of accounts) {
    const first = touch(a.reddit_attribution, now);
    const latest = touch(a.reddit_last_touch, now);
    const paidAt = firstPaid.get(a.id);
    if (a.reddit_attribution && !first) result.invalidAttributions++;
    if ((first && paidAt !== undefined && paidAt < first.at) || (!first && latest && paidAt !== undefined && paidAt < latest.at)) {
      result.reengagedAccounts++;
      continue;
    }
    if (!first) continue;
    if (!first.campaign || !first.audience || !first.creative || !first.adGroup || !first.adId) result.metadataPendingAccounts++;
    const { at, visitorId: _visitorId, ...dimensions } = first;
    const row = get(dimensions).row;
    const ownPayments = payments.filter((p) => p.account_id === a.id && p.paid_at >= at);
    const paidPurchases = ownPayments.filter((p) => p.paid_amount_cents !== null && Number.isSafeInteger(p.paid_amount_cents) && p.paid_amount_cents > 0);
    const firstCashAt = paidPurchases.length ? Math.min(...paidPurchases.map((p) => p.paid_at)) : undefined;
    const payer = firstCashAt !== undefined && paidAt !== undefined && paidAt >= at;
    const ownCalls = payer ? calls.filter((c) => c.account_id === a.id && c.created_at >= firstCashAt!) : [];
    const dates = new Set(ownCalls.map((c) => new Date(c.answered_at ?? c.created_at).toISOString().slice(0, 10)));
    const done = ownCalls.filter((c) => c.result === "done");
    const unknown = ownPayments.filter((p) => p.paid_amount_cents === null || !Number.isSafeInteger(p.paid_amount_cents) || p.paid_amount_cents < 0).length;
    const cash = ownPayments.reduce((s, p) => s + (p.paid_amount_cents !== null && Number.isSafeInteger(p.paid_amount_cents) && p.paid_amount_cents >= 0 ? p.paid_amount_cents : 0), 0);
    for (const target of [row, result.summary]) {
      target.acquiredAccounts++;
      target.firstPaying += Number(payer);
      target.paidCallers += Number(ownCalls.length > 0);
      target.successfulCallers += Number(done.length > 0);
      target.successfulTasks += done.length;
      target.returningPaidCallers += Number(dates.size >= 2);
      target.returningEligible += Number(payer && now >= firstCashAt! + 7 * DAY);
      target.matureReturningPaidCallers += Number(payer && now >= firstCashAt! + 7 * DAY && dates.size >= 2);
      target.repeatBuyers += Number(paidPurchases.length >= 2);
      target.unknownPayments += unknown;
      target.revenueCents = unknown || target.revenueCents === null ? null : target.revenueCents + cash;
    }
  }
  result.summary.visitors = allVisitors.size;
  result.groups = [...groups.values()].map(({ row, visitors }) => ({ ...row, visitors: visitors.size })).sort((a, b) => b.firstPaying - a.firstPaying || b.acquiredAccounts - a.acquiredAccounts || b.visitors - a.visitors);
  const delivery = new Map<string, RedditDeliveryRow>();
  for (const d of input.redditDelivery ?? []) {
    if (d.account_id && !ids.has(d.account_id)) continue;
    const k = JSON.stringify([d.event_name, d.state]);
    const previous = delivery.get(k);
    delivery.set(k, { event_name: d.event_name, state: d.state, count: (previous?.count ?? 0) + d.count });
  }
  result.delivery = [...delivery.values()];
  if (input.redditDeliveryStatus) {
    result.conversionConfigured = input.redditDeliveryStatus.configured === 1;
    result.conversionCheckedAt = input.redditDeliveryStatus.checked_at;
  }
  return result;
}
