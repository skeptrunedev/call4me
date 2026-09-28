/** API keys look like `cb_live_<32 chars>`; only the SHA-256 hash is stored. */
export const KEY_PREFIX = 'cb_live_';

/** No look-alikes (0/o, 1/l/i), since people read keys off screens. 31 symbols x 32 ≈ 158 bits. */
const KEY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let out = '';
  for (const b of bytes) out += KEY_ALPHABET[b % KEY_ALPHABET.length];
  return `${KEY_PREFIX}${out}`;
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

/** The AES-GCM key that seals API keys at rest, derived from a worker secret. */
async function sealingKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('callbay api key seal v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

/** An API key encrypted for storage: `<iv>.<ciphertext>`, both base64. */
export async function sealKey(secret: string, key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealingKey(secret), new TextEncoder().encode(key));
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

/** The key inside a sealed value, or null when it was sealed under another secret or is malformed. */
export async function unsealKey(secret: string, sealed: string): Promise<string | null> {
  const [iv, ct] = sealed.split('.');
  if (!iv || !ct) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await sealingKey(secret), unb64(ct));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
