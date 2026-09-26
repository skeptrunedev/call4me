import { newId } from './ids';

/** API keys look like `cb_live_<32 chars>`; only the SHA-256 hash is stored. */
export const KEY_PREFIX = 'cb_live_';

export function newApiKey(): string {
  return `${KEY_PREFIX}${newId(32)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** What we show in lists so a person can tell keys apart: `cb_live_ab12…`. */
export const keyHint = (key: string) => `${key.slice(0, KEY_PREFIX.length + 4)}…`;

/** Hex HMAC-SHA256, for URLs that must prove they came from us (the media stream URL). */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison for secrets of equal length. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
