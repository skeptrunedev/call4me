import { sha256Hex } from './keys';

/**
 * Idempotency-Key on the routes that place calls (draft-ietf-httpapi-idempotency-key-header): a
 * client retrying a request (a timeout, a connector's automatic retry) sends the same key and gets
 * the call the first attempt made instead of placing a second one. Keys belong to an account; the
 * fingerprint is the request's body, so a key reused for a different request is refused.
 */
export interface Idempotency {
  key: string;
  fingerprint: string;
}

export const IDEMPOTENCY_KEY_MAX = 255;

/** The header's key: the draft sends it as a structured-field string ("abc"), most clients bare (abc). */
export function idempotencyKeyOf(header: string | undefined): { key: string | null } | { error: string } {
  if (header === undefined) return { key: null };
  const key = header.trim().replace(/^"(.*)"$/, '$1');
  if (!key || key.length > IDEMPOTENCY_KEY_MAX) return { error: `Idempotency-Key must be 1 to ${IDEMPOTENCY_KEY_MAX} characters` };
  return { key };
}

/** JSON with object keys sorted, so the same request reads the same however the client ordered it. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The request's fingerprint: SHA-256 of its parsed body. */
export const fingerprintOf = (body: unknown) => sha256Hex(canonical(body));

/**
 * A request whose Idempotency-Key already made `row`: the same request again (answer with `row`,
 * nothing new placed), or a different one under a used key (sameRequest false, refused).
 */
export class IdempotentReplay<T> extends Error {
  constructor(
    readonly row: T,
    readonly sameRequest: boolean,
  ) {
    super(sameRequest ? 'replayed an earlier request with this Idempotency-Key' : 'this Idempotency-Key was already used for a different request; send a new key for a new request');
  }
}

/** The row an earlier request made with this key, as a replay of it, or null when the key is new. */
export function replayOf<T extends { idempotency_hash: string | null }>(row: T | null, idempotency: Idempotency): IdempotentReplay<T> | null {
  return row ? new IdempotentReplay(row, row.idempotency_hash === idempotency.fingerprint) : null;
}

/** D1's error for an INSERT that hit a unique index: here, a concurrent request with the same key won. */
export const isUniqueViolation = (err: unknown) => err instanceof Error && /UNIQUE constraint failed/.test(err.message);
