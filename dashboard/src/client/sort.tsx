import { useMemo, useState, type ReactNode } from "react";

export type SortValue = string | number | null | undefined;
type Dir = "asc" | "desc";

/**
 * Click-to-sort for a table. `value` gives each column's sort key; missing values always sort last.
 * The sort is stable, so rows that tie keep the order they came in (e.g. the server's default order).
 */
export function useSort<T, K extends string>(rows: T[], value: (row: T, key: K) => SortValue, initial?: { key: NoInfer<K>; dir: Dir }) {
  const [sort, setSort] = useState<{ key: K; dir: Dir } | null>(initial ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    return rows
      .map((row, i) => ({ row, i, v: value(row, sort.key) }))
      .sort((a, b) => {
        const am = a.v === null || a.v === undefined;
        const bm = b.v === null || b.v === undefined;
        if (am || bm) return am === bm ? a.i - b.i : am ? 1 : -1;
        const cmp = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v));
        return cmp * sign || a.i - b.i;
      })
      .map((x) => x.row);
  }, [rows, sort, value]);

  /**
   * A header cell that sorts by `key`. Numeric columns (amounts, counts, times) start largest or newest
   * first, text A to Z; clicking again reverses. `align: "start"` keeps a numeric column left-aligned
   * when its cells are text, like "3h ago".
   */
  const th = (key: K, label: ReactNode, opts: { numeric?: boolean; align?: "start" } = {}) => {
    const active = sort?.key === key;
    const next: Dir = active ? (sort!.dir === "asc" ? "desc" : "asc") : opts.numeric ? "desc" : "asc";
    return (
      <th key={key} className={opts.numeric && opts.align !== "start" ? "num" : undefined} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className={`sort${active ? " on" : ""}`} onClick={() => setSort({ key, dir: next })}>
          {label}
          <span className="arrow" aria-hidden="true">
            {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  return { sorted, th };
}
