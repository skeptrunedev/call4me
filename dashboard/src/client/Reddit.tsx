import { useMemo, useState } from "react";
import type { RedditGroup, RedditMetrics } from "../shared/types";
import { useSort, type SortValue } from "./sort";

const money = (cents: number | null) => cents === null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const label = (value: string | null) => value ?? "Pending metadata";
type Column = keyof RedditGroup;
const value = (row: RedditGroup, column: Column): SortValue => row[column];

export function Reddit({ data }: { data: RedditMetrics }) {
  const [audience, setAudience] = useState("");
  const audiences = useMemo(() => [...new Set(data.groups.flatMap((g) => g.audience ? [g.audience] : []))].sort(), [data.groups]);
  const rows = useMemo(() => data.groups.filter((g) => !audience || (audience === "pending" ? g.audience === null : `audience:${g.audience}` === audience)), [data.groups, audience]);
  const { sorted, th } = useSort(rows, value, { key: "firstPaying", dir: "desc" });
  const s = data.summary;
  const cards = [
    ["Visitors", s.visitors, "Unique browser visitors"],
    ["Acquired accounts", s.acquiredAccounts, "First eligible Reddit paid touch"],
    ["First paying", s.firstPaying, "Distinct new paying customers"],
    ["Paid callers", s.paidCallers, "Completed outbound calls with a bill"],
    ["Successful callers", s.successfulCallers, `${s.successfulTasks} tasks reported done`],
    ["Returning paid callers", s.returningPaidCallers, `${s.matureReturningPaidCallers} returning among ${s.returningEligible} payers observed for 7 days`],
    ["Repeat buyers", s.repeatBuyers, "At least two confirmed payments"],
    ["Purchased revenue", money(s.revenueCents), s.unknownPayments ? `${s.unknownPayments} payments have unknown cash amounts` : "Actual checkout and reload cash"],
  ] as const;
  return (
    <section className="panel wide reddit" aria-labelledby="reddit-title">
      <div className="panel-head">
        <h2 id="reddit-title">Reddit acquisition</h2>
        <span className="muted">Spend and CAC: not connected</span>
      </div>
      {data.state !== "ready" ? (
        <p className="sub">Setup awaiting migration. Product metrics remain available while Reddit attribution tables are being prepared.</p>
      ) : (
        <>
          <div className="kpis">
            {cards.map(([name, count, note]) => (
              <div className="kpi" key={name}>
                <span className="label">{name}</span>
                <span className="value">{count}</span>
                <span className="note">{note}</span>
              </div>
            ))}
          </div>
          <div className="panel-head reddit-table-head">
            <label className="reddit-filter">
              Audience
              <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="">All audiences</option>
                {audiences.map((a) => <option key={a} value={`audience:${a}`}>{a}</option>)}
                <option value="pending">Pending metadata</option>
              </select>
            </label>
            <span className="muted">{data.metadataPendingAccounts} accounts with pending metadata · {data.reengagedAccounts} existing payers reengaged · {data.invalidAttributions} invalid attribution records</span>
          </div>
          <div className="scroll">
            <table>
              <thead><tr>
                {th("campaign", "Campaign")}{th("audience", "Audience")}{th("creative", "Creative")}{th("adGroup", "Ad group")}{th("adId", "Ad")}
                {th("visitors", "Visitors", { numeric: true })}{th("acquiredAccounts", "Accounts", { numeric: true })}{th("firstPaying", "First paying", { numeric: true })}
                {th("paidCallers", "Paid callers", { numeric: true })}{th("successfulTasks", "Tasks done", { numeric: true })}
                {th("returningPaidCallers", "Returning", { numeric: true })}{th("returningEligible", "Observed 7 days", { numeric: true })}
                {th("repeatBuyers", "Repeat buyers", { numeric: true })}{th("revenueCents", "Cash revenue", { numeric: true })}
              </tr></thead>
              <tbody>
                {sorted.map((row) => <tr key={JSON.stringify([row.campaign, row.audience, row.creative, row.adGroup, row.adId])}>
                  {(["campaign", "audience", "creative", "adGroup", "adId"] as const).map((k) => <td key={k} className="reddit-dimension" title={label(row[k])}>{label(row[k])}</td>)}
                  {(["visitors", "acquiredAccounts", "firstPaying", "paidCallers", "successfulTasks", "returningPaidCallers", "returningEligible", "repeatBuyers"] as const).map((k) => <td key={k} className="num">{row[k]}</td>)}
                  <td className="num" title={row.unknownPayments ? `${row.unknownPayments} unknown cash amounts` : undefined}>{money(row.revenueCents)}</td>
                </tr>)}
                {!sorted.length && <tr><td colSpan={14} className="muted">{data.groups.length ? "No rows match this audience." : "No Reddit paid touches recorded yet."}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="foot">Accounts and subsequent confirmed payments stay with the first eligible Reddit paid touch. Existing payers are excluded from acquisition. Visitors use browser identity, so devices and cleared cookies can count separately. Anonymous internal visits cannot be identified until linked to an account.</p>
          <p className="foot">Paid callers purchased after the touch, then completed a billed outbound call. Tasks done require a separate done outcome. Returning callers have billed calls on two distinct UTC connection dates. The observed group includes payers whose first payment was at least 7 days ago, and its returning count is shown above. This is cumulative return behavior, not day 7 retention. Unknown cash is never replaced by purchased credits.</p>
          <div className="reddit-delivery">
            <strong>Conversion delivery</strong>
            <span className="muted">{data.conversionConfigured === null ? "Configuration awaiting first check" : data.conversionConfigured ? "Configured" : "Not configured"}{data.conversionCheckedAt ? ` · checked ${new Date(data.conversionCheckedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC` : ""}</span>
            {data.delivery.length ? data.delivery.map((d) => <span key={`${d.event_name}:${d.state}`} className="chip">{d.event_name.replace(/_/g, " ")} · {d.state} {d.count}</span>) : <span className="muted">No conversion delivery events recorded yet.</span>}
          </div>
          <p className="foot">Delivery counts show stored event states. Configuration is the last worker check of the required credentials. Neither confirms attribution inside Reddit. Actual advertising spend has not been imported, so CAC is unavailable.</p>
        </>
      )}
    </section>
  );
}
