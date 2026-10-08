import { sha256Hex } from '../lib/keys';

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

/** Campaign tools can issue unsubscribe links without access to application signing keys. */
export async function createCampaignUnsubscribes(db: D1Database, origin: string, accountIds: string[]): Promise<{ accountId: string; url: string }[]> {
  const base = new URL('/unsubscribe', origin);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Unsubscribe origin must use HTTP or HTTPS');
  if (accountIds.some((id) => typeof id !== 'string' || !id || id.length > 100) || new Set(accountIds).size !== accountIds.length) throw new Error('Unsubscribe account ids must be nonempty and unique');
  const links = await Promise.all(accountIds.map(async (accountId) => {
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const url = new URL(base);
    url.searchParams.set('a', accountId);
    url.searchParams.set('token', token);
    return { accountId, url: url.href, hash: await sha256Hex(token) };
  }));
  // Stay below D1's parameter limit without issuing one request per recipient.
  for (let offset = 0; offset < links.length; offset += 40) {
    const chunk = links.slice(offset, offset + 40);
    await db.prepare(`INSERT INTO email_unsubscribe_tokens (token_hash, account_id) VALUES ${chunk.map(() => '(?, ?)').join(', ')}`)
      .bind(...chunk.flatMap(({ hash, accountId }) => [hash, accountId])).run();
  }
  return links.map(({ accountId, url }) => ({ accountId, url }));
}

export async function createCampaignUnsubscribe(db: D1Database, origin: string, accountId: string): Promise<string> {
  return (await createCampaignUnsubscribes(db, origin, [accountId]))[0].url;
}

export async function validCampaignUnsubscribe(db: D1Database, accountId: string, token: string): Promise<boolean> {
  if (!accountId || accountId.length > 100 || !TOKEN_SHAPE.test(token)) return false;
  const found = await db.prepare('SELECT account_id FROM email_unsubscribe_tokens WHERE token_hash = ? AND account_id = ?')
    .bind(await sha256Hex(token), accountId).first<{ account_id: string }>();
  return found?.account_id === accountId;
}
