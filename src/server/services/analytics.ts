/**
 * What GA hears about an account (lib/ga.ts): its sign_up, purchases and reloads, and the calls
 * its agent places. Events go out under the account's id as user_id and its browser's client id,
 * so activity that happens with no browser (webhooks, agents) still joins the visits that led to it.
 */
import { sendGa, type GaClient, type GaEvent } from '../lib/ga';
import { now } from '../lib/ids';
import type { Account } from './accounts';

/**
 * A stable stand-in client id for an account GA has never seen in a browser, shaped like gtag's
 * ("<random>.<first seen>") so GA counts it as one client.
 */
function serverClient(account: Account): GaClient {
  let h = 2166136261;
  for (const ch of account.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return { clientId: `${h}.${Math.floor(account.created_at / 1000)}`, sessionId: null };
}

export function analytics(env: Pick<Env, 'DB' | 'GA_API_SECRET'>) {
  const db = env.DB;

  /** sign_up goes out once per account, ahead of its first tracked activity. */
  async function claimSignup(account: Account): Promise<GaEvent[]> {
    if (account.ga_signup_at !== null) return [];
    const claimed = await db.prepare(`UPDATE accounts SET ga_signup_at = ? WHERE id = ? AND ga_signup_at IS NULL`).bind(now(), account.id).run();
    if (!claimed.meta.changes) return [];
    // An account opened by a checkout has no sign-in yet.
    const provider = await db
      .prepare(`SELECT p."providerId" AS provider FROM accounts a JOIN "account" p ON p."userId" = a.user_id WHERE a.id = ? LIMIT 1`)
      .bind(account.id)
      .first<{ provider: string }>();
    return [{ name: 'sign_up', params: { method: provider?.provider ?? 'checkout' } }];
  }

  async function track(account: Account, events: GaEvent[], client?: GaClient | null): Promise<void> {
    if (!env.GA_API_SECRET) return;
    const all = [...(await claimSignup(account)), ...events];
    const from = client ?? (account.ga_client_id ? { clientId: account.ga_client_id, sessionId: null } : serverClient(account));
    await sendGa(env, { client: from, userId: account.id, events: all });
  }

  return {
    track,

    /** A signed-in page view: remember the browser for later server-side events, and report a new sign-up from it. */
    async seen(account: Account, client: GaClient | null): Promise<void> {
      if (!client) return;
      if (client.clientId !== account.ga_client_id) await db.prepare(`UPDATE accounts SET ga_client_id = ? WHERE id = ?`).bind(client.clientId, account.id).run();
      if (account.ga_signup_at === null) await track(account, [], client);
    },

    /** Credits bought: a checkout (`transactionId` is its Stripe session) or a monthly reload (its invoice). */
    purchase(account: Account, opts: { transactionId: string; cents: number; reload: boolean; client?: GaClient | null }): Promise<void> {
      const params = { transaction_id: opts.transactionId, currency: 'USD', value: opts.cents / 100, reload: opts.reload };
      return track(account, [{ name: 'purchase', params }], opts.client);
    },
  };
}
