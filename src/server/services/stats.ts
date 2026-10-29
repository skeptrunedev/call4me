/** Aggregate service usage across all accounts: every call the phone provider connected, in or out, and their talk time. */
export async function usageTotals(db: D1Database | D1DatabaseSession): Promise<{ calls: number; minutes: number }> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(billed_seconds), 0) / 60 AS minutes FROM calls WHERE telnyx_call_control_id IS NOT NULL`,
  ).first<{ calls: number; minutes: number }>();
  if (!row) throw new Error('Usage query returned no result');
  return { calls: row.calls, minutes: row.minutes };
}

/** The footer's usage line: "2,703 calls / 7,954 minutes". */
export function usageText({ calls, minutes }: { calls: number; minutes: number }, separator: string): string {
  const n = (v: number, one: string, many: string) => `${v.toLocaleString('en-US')} ${v === 1 ? one : many}`;
  return `${n(calls, 'call', 'calls')}${separator}${n(minutes, 'minute', 'minutes')}`;
}
