/** Aggregate service usage: outbound calls accepted by the phone provider, across all accounts. */
export async function placedCallCount(db: D1Database | D1DatabaseSession): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS total FROM calls WHERE direction = 'outbound' AND telnyx_call_control_id IS NOT NULL`).first<{ total: number }>();
  if (!row) throw new Error('Call count query returned no result');
  return row.total;
}
