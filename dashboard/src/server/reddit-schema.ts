/** Read schema before querying attribution so dashboard deployment can precede migration. */
export async function redditSchemaReady(db: D1Database): Promise<boolean> {
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
  const names = new Set(tables.results.map((r) => r.name));
  const required: Record<string, string[]> = {
    accounts: ["reddit_attribution", "reddit_last_touch"],
    topups: ["reddit_attribution", "paid_amount_cents"],
    reddit_visits: ["id", "visitor_id", "account_id", "campaign", "ad_group", "ad_id", "audience", "creative", "at"],
    reddit_payments: ["id", "account_id", "paid_at", "paid_amount_cents", "kind"],
    reddit_events: ["account_id", "event_name", "state"],
    reddit_delivery_status: ["id", "configured", "checked_at"],
  };
  if (Object.keys(required).some((name) => !names.has(name))) return false;
  const results = await db.batch(Object.keys(required).map((name) => db.prepare(`PRAGMA table_info(${name})`)));
  return Object.values(required).every((columns, i) => {
    const available = new Set((results[i].results as { name: string }[]).map((r) => r.name));
    return columns.every((name) => available.has(name));
  });
}
