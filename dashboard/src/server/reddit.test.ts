import { describe, expect, it } from "vitest";
import { computeReddit, type RedditInput } from "./reddit";
import { redditSchemaReady } from "./reddit-schema";
import type { AccountRow, CallRow, RedditPaymentRow, RedditVisitRow } from "../shared/types";

const DAY = 86_400_000;
const T = Date.parse("2026-10-01T10:00:00Z");
const attribution = (extra: object = {}) => JSON.stringify({ id: "touch", visitorId: "browser", clickId: "private click", uuid: "private uuid", campaign: "Campaign", audience: "Claude", creative: "Booking", adGroup: "Personal tasks", adId: "advert", landing: "/", at: T, ...extra });
const account = (id: string, extra: Partial<AccountRow> = {}): AccountRow => ({ id, email: `${id}@example.com`, created_at: T, reload_status: null, reload_cents: null, reload_renews_at: null, reddit_attribution: attribution({ visitorId: id }), ...extra });
const payment = (id: string, account_id: string, paid_at = T + 1000, extra: Partial<RedditPaymentRow> = {}): RedditPaymentRow => ({ id, account_id, paid_at, paid_amount_cents: 700, kind: "checkout", ...extra });
const call = (id: string, account_id: string, created_at = T + 2000, extra: Partial<CallRow> = {}): CallRow => ({ id, account_id, created_at, answered_at: created_at, direction: "outbound", status: "completed", billed_seconds: 30, cost_cents: 20, result: "partial", ...extra });
const visit = (id: string, visitor_id: string, extra: Partial<RedditVisitRow> = {}): RedditVisitRow => ({ id, visitor_id, account_id: null, campaign: "Campaign", audience: "Claude", creative: "Booking", ad_group: "Personal tasks", ad_id: "advert", at: T, ...extra });
const input = (extra: Partial<RedditInput> = {}): RedditInput => ({ accounts: [], calls: [], redditVisits: [], redditPayments: [], redditPaidHistory: [], redditReady: true, ...extra });

describe("Reddit acquisition", () => {
  it("deduplicates visits, payments and calls without leaking browser or click identifiers", () => {
    const p = payment("checkout", "a");
    const c = call("call", "a", T + 2000, { result: "done" });
    const v = visit("visit", "browser");
    const m = computeReddit(input({ accounts: [account("a")], redditVisits: [v, v, visit("second visit", "browser")], redditPayments: [p, p], calls: [c, c] }), new Set(), T + 9 * DAY);
    expect(m.summary).toMatchObject({ visitors: 1, acquiredAccounts: 1, firstPaying: 1, repeatBuyers: 0, successfulTasks: 1, revenueCents: 700 });
    const json = JSON.stringify(m);
    for (const secret of ["private click", "private uuid", "browser", "visitorId", "account_id", "landing"]) expect(json).not.toContain(secret);
  });

  it("leaves internal accounts, linked visits, money and delivery events out", () => {
    const m = computeReddit(input({ accounts: [account("a"), account("internal", { email: "ME@example.com" })], redditVisits: [visit("internal visit", "internal browser", { account_id: "internal" })], redditPayments: [payment("internal pay", "internal")], calls: [call("internal call", "internal")], redditDelivery: [{ account_id: "internal", event_name: "Purchase", state: "delivered", count: 1 }, { account_id: "a", event_name: "Purchase", state: "pending", count: 1 }] }), new Set(["me@example.com"]), T + DAY);
    expect(m.summary).toMatchObject({ visitors: 0, acquiredAccounts: 1, firstPaying: 0, paidCallers: 0, revenueCents: 0 });
    expect(m.delivery).toEqual([{ event_name: "Purchase", state: "pending", count: 1 }]);
  });

  it("separates completed billed calling from done outcomes and excludes inbound, free and unfinished calls", () => {
    const m = computeReddit(input({ accounts: [account("a"), account("b")], redditPayments: [payment("a pay", "a"), payment("b pay", "b")], calls: [call("partial", "a"), call("inbound", "b", T + 2000, { direction: "inbound", result: "done" }), call("free", "b", T + 2000, { cost_cents: 0, result: "done" }), call("zero seconds", "b", T + 2000, { billed_seconds: 0, result: "done" }), call("unfinished", "b", T + 2000, { status: "in_progress", result: "done" }), call("before payment", "b", T + 500, { result: "done" })] }), new Set(), T + DAY);
    expect(m.summary).toMatchObject({ firstPaying: 2, paidCallers: 1, successfulCallers: 0, successfulTasks: 0 });
  });

  it("retains reload cash in the first touch cohort and counts repeat buyers only once", () => {
    const m = computeReddit(input({ accounts: [account("a", { reddit_last_touch: attribution({ campaign: "Retargeting", at: T + DAY }) })], redditPayments: [payment("checkout", "a"), payment("reload", "a", T + DAY, { kind: "reload", paid_amount_cents: 900 }), payment("third", "a", T + 2 * DAY, { kind: "reload", paid_amount_cents: 900 })] }), new Set(), T + 3 * DAY);
    expect(m.summary).toMatchObject({ firstPaying: 1, repeatBuyers: 1, revenueCents: 2500 });
    expect(m.groups).toHaveLength(1);
    expect(m.groups[0].campaign).toBe("Campaign");
  });

  it("excludes existing funded customers even if their old topup is refunded or attribution is erroneous", () => {
    const m = computeReddit(input({ accounts: [account("old"), account("last only", { reddit_attribution: null, reddit_last_touch: attribution() }), account("unpaid existing", { created_at: T - DAY })], redditPaidHistory: [{ account_id: "old", paid_at: T - DAY }, { account_id: "last only", paid_at: T - 1000 }], redditPayments: [payment("new reload", "old"), payment("first", "unpaid existing")], calls: [call("old call", "old")] }), new Set(), T + DAY);
    expect(m.reengagedAccounts).toBe(2);
    expect(m.summary).toMatchObject({ acquiredAccounts: 1, firstPaying: 1, paidCallers: 0, revenueCents: 700 });
  });

  it("measures return on distinct UTC connection dates and exposes maturity without calling young users failures", () => {
    const m = computeReddit(input({ accounts: [account("mature"), account("young", { reddit_attribution: attribution({ at: T + 8 * DAY }) })], redditPayments: [payment("mature pay", "mature"), payment("young pay", "young", T + 8 * DAY + 1000)], calls: [call("m1", "mature"), call("m2", "mature", T + DAY), call("m3", "mature", T + DAY + 1000), call("y1", "young", T + 8 * DAY + 2000), call("y2", "young", T + 9 * DAY + 2000)] }), new Set(), T + 9 * DAY + 3000);
    expect(m.summary).toMatchObject({ returningPaidCallers: 2, returningEligible: 1, matureReturningPaidCallers: 1 });
  });

  it("leaves unknown cash unknown and keeps missing metadata explicit", () => {
    const m = computeReddit(input({ accounts: [account("a", { reddit_attribution: attribution({ campaign: null }) })], redditPayments: [payment("unknown", "a", T + 1000, { paid_amount_cents: null })] }), new Set(), T + DAY);
    expect(m.summary).toMatchObject({ firstPaying: 0, revenueCents: null, unknownPayments: 1 });
    expect(m.metadataPendingAccounts).toBe(1);
    expect(m.groups[0].campaign).toBeNull();
  });

  it("does not invent attributed customers from malformed or future touches", () => {
    const m = computeReddit(input({ accounts: [account("bad", { reddit_attribution: "{" }), account("future", { reddit_attribution: attribution({ at: T + 2 * DAY }) }), account("missing", { reddit_attribution: attribution({ visitorId: null }) }), account("untracked", { reddit_attribution: null })] }), new Set(), T + DAY);
    expect(m.invalidAttributions).toBe(3);
    expect(m.summary.acquiredAccounts).toBe(0);
  });

  it("does not count zero cash coupon purchases or unknown cash as paying customers or repeat buyers", () => {
    const m = computeReddit(input({ accounts: [account("coupon"), account("paid")], redditPayments: [payment("coupon one", "coupon", T + 1000, { paid_amount_cents: 0 }), payment("coupon two", "coupon", T + 2000, { paid_amount_cents: 0 }), payment("zero first", "paid", T + 1000, { paid_amount_cents: 0 }), payment("positive", "paid", T + 3000)], calls: [call("coupon call", "coupon"), call("before cash", "paid", T + 2000)] }), new Set(), T + DAY);
    expect(m.summary).toMatchObject({ firstPaying: 1, repeatBuyers: 0, paidCallers: 0, revenueCents: 700 });
  });

  it("reports configuration presence and last check without credential details", () => {
    const m = computeReddit(input({ redditDeliveryStatus: { configured: 0, checked_at: T } }), new Set(), T + DAY);
    expect(m.conversionConfigured).toBe(false);
    expect(m.conversionCheckedAt).toBe(T);
  });

  it("does not treat a zero cash purchase before the touch as prior paid acquisition", () => {
    const m = computeReddit(input({ accounts: [account("a")], redditPayments: [payment("old coupon", "a", T - DAY, { paid_amount_cents: 0 }), payment("first cash", "a")] }), new Set(), T + DAY);
    expect(m.reengagedAccounts).toBe(0);
    expect(m.summary).toMatchObject({ acquiredAccounts: 1, firstPaying: 1, repeatBuyers: 0, revenueCents: 700 });
  });

  it("returns a setup state when migration has not completed", () => {
    const m = computeReddit(input({ redditReady: false, accounts: [account("a")] }), new Set(), T + DAY);
    expect(m.state).toBe("awaiting migration");
    expect(m.groups).toEqual([]);
  });
});

describe("Reddit schema rollout", () => {
  const schema = { accounts: ["reddit_attribution", "reddit_last_touch"], topups: ["reddit_attribution", "paid_amount_cents"], reddit_visits: ["id", "visitor_id", "account_id", "campaign", "ad_group", "ad_id", "audience", "creative", "at"], reddit_payments: ["id", "account_id", "paid_at", "paid_amount_cents", "kind"], reddit_events: ["account_id", "event_name", "state"], reddit_delivery_status: ["id", "configured", "checked_at"] };
  const db = (columns: Record<string, string[]>, queries: string[]) => ({
    prepare(sql: string) { queries.push(sql); return { sql, all: async () => ({ results: Object.keys(columns).map((name) => ({ name })) }) }; },
    batch: async (statements: { sql: string }[]) => statements.map(({ sql }) => ({ results: (columns[sql.match(/\((\w+)\)/)![1]] ?? []).map((name) => ({ name })) })),
  }) as unknown as D1Database;
  it("does not query unavailable new tables", async () => {
    const queries: string[] = [];
    expect(await redditSchemaReady(db({ accounts: [] }, queries))).toBe(false);
    expect(queries).toEqual(["SELECT name FROM sqlite_master WHERE type = 'table'"]);
  });
  it("waits for all required columns, then recognizes the complete migration", async () => {
    expect(await redditSchemaReady(db({ ...schema, topups: ["reddit_attribution"] }, []))).toBe(false);
    expect(await redditSchemaReady(db(schema, []))).toBe(true);
  });
});
