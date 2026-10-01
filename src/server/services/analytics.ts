/**
 * What GA (lib/ga.ts) and Meta (lib/meta.ts) hear about an account: its sign_up, purchases and
 * reloads, and the calls its agent places. Events go out under the account's id (GA's user_id,
 * Meta's hashed external_id) and its browser's ids, so activity that happens with no browser
 * (webhooks, agents) still joins the visits and ad clicks that led to it.
 */
import { gaEmailHash, sendGa, type GaClient, type GaEvent } from '../lib/ga';
import { realEmail } from '../lib/auth-options';
import { newId, now } from '../lib/ids';
import { sendMeta, type MetaBrowser, type MetaEvent } from '../lib/meta';
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

/**
 * The Meta side of an event. Calls carry nothing about who was called or why: the category
 * alone can be health information, which Meta must not get.
 */
function metaEvent(e: GaEvent): MetaEvent | null {
  switch (e.name) {
    case 'sign_up':
      return { name: 'CompleteRegistration', id: newId() };
    case 'purchase':
      return {
        name: 'Purchase',
        id: String(e.params?.transaction_id),
        ...(e.params?.reload ? { actionSource: 'system_generated' as const } : {}),
        customData: { currency: 'USD', value: Number(e.params?.value) },
      };
    case 'call_placed':
      return { name: 'CallPlaced', id: newId() };
    default:
      return null;
  }
}

/** The browser an event came from, as each of GA and Meta knows it. */
export interface Visitor {
  ga: GaClient | null;
  meta: MetaBrowser | null;
}

/** GA's hashed email for an account; none for X sign-ins known only by a placeholder address. */
export const emailHashOf = async (account: Pick<Account, 'email'>): Promise<string | null> => {
  const email = realEmail(account.email);
  return email ? gaEmailHash(email) : null;
};

export function analytics(env: Pick<Env, 'DB' | 'GA_API_SECRET' | 'META_PIXEL_ID' | 'META_CAPI_TOKEN'>) {
  const db = env.DB;
  const metaOn = Boolean(env.META_PIXEL_ID && env.META_CAPI_TOKEN);

  /** sign_up goes out once per account, ahead of its first tracked activity, to GA and Meta alike. */
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

  async function track(account: Account, events: GaEvent[], from: Visitor = { ga: null, meta: null }): Promise<void> {
    if (!env.GA_API_SECRET && !metaOn) return;
    const all = [...(await claimSignup(account)), ...events];
    const client = from.ga ?? (account.ga_client_id ? { clientId: account.ga_client_id, sessionId: null } : serverClient(account));
    // The account's last known Meta ids stand in for any the event's own browser lacks.
    const browser: MetaBrowser = {
      fbp: from.meta?.fbp ?? account.meta_fbp,
      fbc: from.meta?.fbc ?? account.meta_fbc,
      ip: from.meta?.ip ?? null,
      userAgent: from.meta?.userAgent ?? null,
      url: from.meta?.url ?? null,
    };
    const metaEvents = all.map(metaEvent).filter((e): e is MetaEvent => e !== null);
    await Promise.all([sendGa(env, { client, userId: account.id, emailHash: await emailHashOf(account), events: all }), sendMeta(env, { user: { externalId: account.id }, browser, events: metaEvents })]);
  }

  return {
    track,

    /** A signed-in page view: remember the browser for later server-side events, and report a new sign-up from it. */
    async seen(account: Account, from: Visitor): Promise<void> {
      const fbp = from.meta?.fbp ?? null;
      const fbc = from.meta?.fbc ?? null;
      if ((fbp && fbp !== account.meta_fbp) || (fbc && fbc !== account.meta_fbc)) {
        await db.prepare(`UPDATE accounts SET meta_fbp = COALESCE(?, meta_fbp), meta_fbc = COALESCE(?, meta_fbc) WHERE id = ?`).bind(fbp, fbc, account.id).run();
      }
      if (!from.ga) return;
      if (from.ga.clientId !== account.ga_client_id) await db.prepare(`UPDATE accounts SET ga_client_id = ? WHERE id = ?`).bind(from.ga.clientId, account.id).run();
      if (account.ga_signup_at === null) await track(account, [], from);
    },

    /** Credits bought: a checkout (`transactionId` is its Stripe session) or a monthly reload (its invoice). */
    purchase(account: Account, opts: { transactionId: string; cents: number; reload: boolean; from?: Visitor }): Promise<void> {
      const params = { transaction_id: opts.transactionId, currency: 'USD', value: opts.cents / 100, reload: opts.reload };
      return track(account, [{ name: 'purchase', params }], opts.from);
    },
  };
}
