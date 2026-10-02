import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { Cohort, CreditRow, CreditStatus, Metrics, UserRow } from "../shared/types";
import { useSort, type SortValue } from "./sort";

const usd = (cents: number) => {
  const digits = cents % 100 ? 2 : 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
const minutes = (m: number | null) => (m === null ? "–" : m < 1 ? "under a minute" : `${Math.round(m)} min`);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const ago = (ms: number, now: number) => {
  const m = Math.round((now - ms) / 60000);
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

// SVG fill and stroke attributes can't read CSS variables, so charts get the resolved theme colors.
const TOKENS = ["accent", "money", "good", "warn", "bad", "muted", "line", "fg", "panel", "hover"] as const;
type Palette = Record<(typeof TOKENS)[number], string>;
const readPalette = (): Palette => {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKENS.map((t) => [t, style.getPropertyValue(`--${t}`).trim()])) as Palette;
};
function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPalette(readPalette());
    scheme.addEventListener("change", update);
    return () => scheme.removeEventListener("change", update);
  }, []);
  return palette;
}

export function App() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/metrics", { credentials: "same-origin" });
      if (res.redirected || res.status === 401 || res.headers.get("content-type")?.includes("text/html"))
        throw new Error("Your session has ended. Reload this page to sign in again.");
      const body = (await res.json()) as Metrics & { error?: string };
      if (!res.ok) throw new Error(body.error || `Couldn't load metrics (${res.status}).`);
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <main className="page">
      <header className="top">
        <div>
          <h1>call4me</h1>
          <p className="sub">Real users only. Our own and reviewer accounts are left out.</p>
        </div>
        <div className="status">
          {data && <span>Updated {when(data.generatedAt)}</span>}
          <button type="button" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {data ? <Dashboard m={data} /> : !error && <p className="sub">Loading metrics…</p>}
    </main>
  );
}

function Dashboard({ m }: { m: Metrics }) {
  const s = m.summary;
  const c = usePalette();
  const axis = { stroke: c.muted, fontSize: 11, tickLine: false, axisLine: false } as const;
  const tooltip = {
    contentStyle: { background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, fontSize: 12, color: c.fg },
    labelStyle: { color: c.fg },
    cursor: { fill: c.hover },
  } as const;
  const days = m.days.map((d) => ({ ...d, label: shortDate(d.date), revenue: d.revenueCents / 100 }));
  return (
    <>
      <section className="kpis">
        <Kpi label="Users" value={s.users} note={`${s.activeLast7} placed a call in the last 7 days`} />
        <Kpi label="Paying" value={s.paying} note={`${pct(s.paying, s.users)} of users · median ${minutes(s.medianMinutesToPay)} to pay`} />
        <Kpi label="Activated" value={s.activated} note={`${pct(s.activated, s.users)} placed at least one call`} />
        <Kpi label="Returning" value={s.returning} note={`${pct(s.returning, s.activated)} of callers came back another day`} tone="key" />
        <Kpi label="Gross" value={usd(s.grossCents)} note={`${s.repeatBuyers} bought again · ${usd(s.spentCents)} spent on calls`} />
        <Kpi label="MRR" value={usd(s.mrrCents)} note={`${s.monthlyPlans} active monthly plans · ${s.cancelledPlans} cancelled`} />
      </section>

      <CreditBurn credits={m.credits} now={m.generatedAt} c={c} />

      <section className="grid">
        <Panel title="Signups and new paying users" legend={[["var(--accent)", "Signups"], ["var(--money)", "New paying"]]}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={days} barGap={2}>
              <CartesianGrid vertical={false} stroke={c.line} />
              <XAxis dataKey="label" {...axis} />
              <YAxis allowDecimals={false} width={28} {...axis} />
              <Tooltip {...tooltip} />
              <Bar isAnimationActive={false} dataKey="signups" name="Signups" fill={c.accent} radius={[3, 3, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="newPaying" name="New paying" fill={c.money} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Revenue per day">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={days}>
              <CartesianGrid vertical={false} stroke={c.line} />
              <XAxis dataKey="label" {...axis} />
              <YAxis width={40} tickFormatter={(v) => `$${v}`} {...axis} />
              <Tooltip {...tooltip} formatter={(v) => [`$${v}`, "Revenue"]} />
              <Bar isAnimationActive={false} dataKey="revenue" fill={c.money} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Daily usage" legend={[["var(--accent)", "Users who called"], ["var(--muted)", "Calls"], ["var(--good)", "Calls fully done"]]}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={days}>
              <CartesianGrid vertical={false} stroke={c.line} />
              <XAxis dataKey="label" {...axis} />
              <YAxis allowDecimals={false} width={28} {...axis} />
              <Tooltip {...tooltip} cursor={{ stroke: c.line }} />
              <Line isAnimationActive={false} dataKey="activeCallers" name="Users who called" stroke={c.accent} strokeWidth={2} dot={false} />
              <Line isAnimationActive={false} dataKey="calls" name="Calls" stroke={c.muted} strokeWidth={1.5} dot={false} />
              <Line isAnimationActive={false} dataKey="doneCalls" name="Calls fully done" stroke={c.good} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Funnel">
          <div className="bars">
            {m.funnel.map((f) => (
              <Meter key={f.label} label={f.label} value={f.users} max={m.funnel[0].users} text={`${f.users} · ${pct(f.users, m.funnel[0].users)}`} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid">
        <Panel title="Retention by signup day" wide>
          <CohortTable cohorts={m.cohorts} />
          <p className="foot">
            Share of each day's signups who placed a call on day N after signing up. A cell fills in once that day has fully passed for at least one user.
          </p>
        </Panel>
        <Panel title="Call outcomes">
          <div className="bars">
            {m.outcomes.map((o) => (
              <Meter key={o.result} label={sentence(o.result)} value={o.calls} max={m.outcomes[0]?.calls ?? 1} text={String(o.calls)} tone={o.result === "done" ? "good" : undefined} />
            ))}
          </div>
        </Panel>
      </section>

      <Users users={m.users} now={m.generatedAt} />
    </>
  );
}

// Most at risk of not renewing first.
const STATUSES: { key: CreditStatus; label: string; tone: keyof Palette; meaning: string }[] = [
  { key: "cancelled", label: "Cancelled", tone: "muted", meaning: "turned off their monthly reload" },
  { key: "not started", label: "Not started", tone: "bad", meaning: "paid but hasn't used any credits" },
  { key: "behind", label: "Behind", tone: "warn", meaning: "using credits slower than the month is passing" },
  { key: "on pace", label: "On pace", tone: "good", meaning: "will use their credits by renewal" },
  { key: "running low", label: "Running low", tone: "money", meaning: "under $2 left, needs more soon" },
];
const daysUntil = (ms: number, now: number) => {
  const d = Math.round((ms - now) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "in 1 day" : `in ${d} days`;
};

const rank = (st: CreditStatus) => STATUSES.findIndex((x) => x.key === st);
type CreditCol = "email" | "status" | "plan" | "used" | "left" | "lastCall";
const creditValue = (r: CreditRow, key: CreditCol): SortValue =>
  ({
    email: r.email,
    status: rank(r.status),
    // Monthly plans sort by renewal date, ahead of one-time and cancelled.
    plan: r.plan === "monthly" ? r.periodEnd : r.plan === "one-time" ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER,
    used: r.usedPct,
    left: r.balanceCents,
    lastCall: r.lastCallAt,
  })[key];

function CreditBurn({ credits, now, c }: { credits: CreditRow[]; now: number; c: Palette }) {
  const xMax = Math.max(10, Math.ceil(Math.max(0, ...credits.map((r) => r.elapsedPct)) / 10) * 10);
  // Riskiest first, then soonest renewal; sorting by a column keeps this order within ties.
  const byRisk = useMemo(() => [...credits].sort((a, b) => rank(a.status) - rank(b.status) || a.periodEnd - b.periodEnd), [credits]);
  const { sorted: rows, th } = useSort(byRisk, creditValue, { key: "status", dir: "asc" });
  return (
    <section className="panel wide">
      <div className="panel-head">
        <h2>Credit burn: who's on track to renew</h2>
        <div className="legend">
          {STATUSES.map((st) => (
            <span key={st.key} title={st.meaning}>
              <i style={{ background: c[st.tone] }} />
              {st.label} {credits.filter((r) => r.status === st.key).length}
            </span>
          ))}
        </div>
      </div>
      <div className="burn">
        <div className="burn-chart">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 12 }}>
              <CartesianGrid stroke={c.line} />
              <XAxis
                type="number"
                dataKey="elapsedPct"
                domain={[0, xMax]}
                tickFormatter={(v) => `${v}%`}
                stroke={c.muted}
                fontSize={11}
                tickLine={false}
                label={{ value: "Billing month elapsed", position: "insideBottom", offset: -12, fill: c.muted, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="usedPct"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                stroke={c.muted}
                fontSize={11}
                tickLine={false}
                width={40}
                label={{ value: "Credits used", angle: -90, position: "left", offset: 0, fill: c.muted, fontSize: 11 }}
              />
              <ZAxis range={[60, 60]} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: xMax, y: xMax }]} stroke={c.muted} strokeDasharray="4 4" ifOverflow="hidden" />
              <Tooltip
                cursor={{ stroke: c.line }}
                content={({ payload }) => {
                  const r = payload?.[0]?.payload as CreditRow | undefined;
                  if (!r) return null;
                  return (
                    <div className="tip" style={{ background: c.panel, borderColor: c.line, color: c.fg }}>
                      <strong>{r.email}</strong>
                      <span>
                        {Math.round(r.usedPct)}% of {usd(r.creditsCents)} used · {Math.round(r.elapsedPct)}% into the month
                      </span>
                      <span>
                        {r.plan === "monthly" ? `Renews ${daysUntil(r.periodEnd, now)}` : r.plan === "cancelled" ? "Monthly reload cancelled" : "One-time purchase"}
                      </span>
                    </div>
                  );
                }}
              />
              {STATUSES.map((st) => (
                <Scatter key={st.key} isAnimationActive={false} data={credits.filter((r) => r.status === st.key)} fill={c[st.tone]} fillOpacity={0.85} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
          <p className="foot">
            Each dot is a paying user. Above the dashed line, they'll use their credits before renewal. Monthly plans use the renewal Stripe has scheduled; one-time buyers get 30 days from their latest purchase.
          </p>
        </div>
        <div className="scroll burn-table">
          <table>
            <thead>
              <tr>
                {th("email", "Email")}
                {th("status", "Status")}
                {th("plan", "Plan")}
                {th("used", "Used", { numeric: true })}
                {th("left", "Left", { numeric: true })}
                {th("lastCall", "Last call", { numeric: true, align: "start" })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUSES[rank(r.status)];
                return (
                  <tr key={r.email}>
                    <td className="email" title={r.email}>{r.email}</td>
                    <td>
                      <span className="status" style={{ color: c[st.tone], borderColor: c[st.tone] }} title={st.meaning}>
                        {st.label}
                      </span>
                    </td>
                    <td>{r.plan === "monthly" ? `monthly, renews ${daysUntil(r.periodEnd, now)}` : r.plan}</td>
                    <td className="num">
                      {usd(r.spentCents)} <span className="muted">/ {usd(r.creditsCents)}</span>
                    </td>
                    <td className="num">{usd(r.balanceCents)}</td>
                    <td>{r.lastCallAt ? ago(r.lastCallAt, now) : <span className="muted">never</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string | number; note: string; tone?: "key" }) {
  return (
    <div className={`kpi${tone ? ` ${tone}` : ""}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <span className="note">{note}</span>
    </div>
  );
}

function Panel({ title, legend, wide, children }: { title: string; legend?: [string, string][]; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`panel${wide ? " wide" : ""}`}>
      <div className="panel-head">
        <h2>{title}</h2>
        {legend && (
          <div className="legend">
            {legend.map(([color, name]) => (
              <span key={name}>
                <i style={{ background: color }} />
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Meter({ label, value, max, text, tone }: { label: string; value: number; max: number; text: string; tone?: "good" }) {
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <span className="meter-track">
        <span className={`meter-fill${tone ? ` ${tone}` : ""}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="meter-value">{text}</span>
    </div>
  );
}

type CohortCol = "date" | "users" | `day${number}`;
const cohortValue = (c: Cohort, key: CohortCol): SortValue => {
  if (key === "date") return c.date;
  if (key === "users") return c.size;
  const d = c.days[Number(key.slice(3))];
  return d ? d.active / d.eligible : null;
};

function CohortTable({ cohorts }: { cohorts: Cohort[] }) {
  const width = cohorts[0]?.days.length ?? 0;
  const { sorted, th } = useSort(cohorts, cohortValue, { key: "date", dir: "asc" });
  return (
    <div className="scroll">
      <table className="cohort">
        <thead>
          <tr>
            {th("date", "Signed up")}
            {th("users", "Users", { numeric: true })}
            {Array.from({ length: width }, (_, n) => th(`day${n}`, `Day ${n}`, { numeric: true }))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.date}>
              <td>{shortDate(c.date)}</td>
              <td className="num">{c.size}</td>
              {c.days.map((d, n) =>
                d ? (
                  <td key={n} className="num cell" style={{ "--heat": d.active / d.eligible } as CSSProperties} title={`${d.active} of ${d.eligible}`}>
                    {pct(d.active, d.eligible)}
                  </td>
                ) : (
                  <td key={n} className="num empty" />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Filter = "all" | "paying" | "free";
type UserCol = "email" | "signedUp" | "paid" | "calls" | "activeDays" | "lastCall" | "balance";
const userValue = (u: UserRow, key: UserCol): SortValue =>
  ({
    email: u.email,
    signedUp: u.signedUpAt,
    // Free users sort by the credits we gave them, below everyone who paid.
    paid: u.paidCents || u.grantedCents / 1000,
    calls: u.calls,
    activeDays: u.activeDays,
    lastCall: u.lastCallAt,
    balance: u.balanceCents,
  })[key];

function Users({ users, now }: { users: UserRow[]; now: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = useMemo(() => users.filter((u) => filter === "all" || (filter === "paying" ? u.paidCents > 0 : u.paidCents === 0)), [users, filter]);
  const { sorted: shown, th } = useSort(filtered, userValue, { key: "signedUp", dir: "desc" });
  return (
    <section className="panel wide">
      <div className="panel-head">
        <h2>Users</h2>
        <div className="tabs" role="tablist">
          {(["all", "paying", "free"] as Filter[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)} ({users.filter((u) => f === "all" || (f === "paying" ? u.paidCents > 0 : u.paidCents === 0)).length})
            </button>
          ))}
        </div>
      </div>
      <div className="scroll">
        <table className="users">
          <thead>
            <tr>
              {th("email", "Email")}
              {th("signedUp", "Signed up", { numeric: true, align: "start" })}
              {th("paid", "Paid", { numeric: true })}
              {th("calls", "Calls", { numeric: true })}
              {th("activeDays", "Days active", { numeric: true })}
              {th("lastCall", "Last call", { numeric: true, align: "start" })}
              {th("balance", "Balance", { numeric: true })}
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.email}>
                <td className="email">{u.email}</td>
                <td>{ago(u.signedUpAt, now)}</td>
                <td className="num">
                  {u.paidCents ? usd(u.paidCents) : <span className="chip">{u.grantedCents ? `free +${usd(u.grantedCents)}` : "free"}</span>}
                  {u.monthly && <span className="chip plan">monthly</span>}
                </td>
                <td className="num">{u.calls}</td>
                <td className="num">{u.activeDays >= 2 ? <span className="chip good">{u.activeDays}</span> : u.activeDays}</td>
                <td>{u.lastCallAt ? ago(u.lastCallAt, now) : <span className="muted">never</span>}</td>
                <td className="num">{usd(u.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
