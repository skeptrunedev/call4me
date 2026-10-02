import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Cohort, Metrics, UserRow } from "../shared/types";

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
const TOKENS = ["accent", "money", "good", "muted", "line", "fg", "panel", "hover"] as const;
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
        <Kpi label="MRR" value={usd(s.mrrCents)} note={`${s.monthlyPlans} monthly plans paid in the last 31 days`} />
      </section>

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

function CohortTable({ cohorts }: { cohorts: Cohort[] }) {
  const width = cohorts[0]?.days.length ?? 0;
  return (
    <div className="scroll">
      <table className="cohort">
        <thead>
          <tr>
            <th>Signed up</th>
            <th className="num">Users</th>
            {Array.from({ length: width }, (_, n) => (
              <th key={n} className="num">
                Day {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
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

function Users({ users, now }: { users: UserRow[]; now: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = users.filter((u) => filter === "all" || (filter === "paying" ? u.paidCents > 0 : u.paidCents === 0));
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
              <th>Email</th>
              <th>Signed up</th>
              <th className="num">Paid</th>
              <th className="num">Calls</th>
              <th className="num">Days active</th>
              <th>Last call</th>
              <th className="num">Balance</th>
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
