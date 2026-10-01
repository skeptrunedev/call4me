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

const KEY_LENGTH = KEY_PREFIX.length + 32;
const KEY_SHAPE = new RegExp(`^${KEY_PREFIX}[${KEY_ALPHABET}]{32}$`);
const ESCAPE = /%[0-9a-f]{2}/i;

/**
 * The key a client meant to send, undoing what integrations do to it on the way: URL encoding
 * (once or twice), a pasted "Bearer " prefix, quotes, surrounding whitespace. Keys only use
 * [a-z2-9_], so none of these can turn one key into another.
 */
export function normalizeKey(raw: string): string {
  let key = raw.trim();
  for (let i = 0; i < 2 && ESCAPE.test(key); i++) {
    try {
      key = decodeURIComponent(key).trim();
    } catch {
      break;
    }
  }
  return key.replace(/^bearer\s+/i, '').replace(/^["']+|["']+$/g, '').trim();
}

/**
 * Why a presented key was refused, saying what actually arrived without echoing the secret: its
 * length, its first characters (what keyHint shows anyway), and what about it is off. An error
 * that only says "invalid key" sends people to re-paste a key that was fine.
 */
export function describeKey(raw: string): string {
  if (!raw.trim()) return 'the key we received was empty';
  const key = normalizeKey(raw);
  const got = `we received ${raw.length} characters starting "${keyHint(raw)}"`;
  const problems: string[] = [];
  if (ESCAPE.test(raw)) problems.push(`it was URL-encoded (${raw.match(ESCAPE)![0]}), so whatever sent it encoded the key${key !== raw ? `; decoded it is ${key.length} characters` : ''}`);
  if (/\s/.test(raw.trim())) problems.push('it has whitespace or a line break inside it');
  if (KEY_SHAPE.test(key)) {
    problems.push(`that is a well-formed call4me key, but no account has it: it was regenerated or never existed. Copy your current key from the account page`);
  } else {
    if (!key.startsWith(KEY_PREFIX)) problems.push(`call4me keys start with ${KEY_PREFIX}`);
    if (key.length !== KEY_LENGTH) problems.push(`call4me keys are ${KEY_LENGTH} characters, this is ${key.length}`);
    const odd = [...new Set(key.slice(KEY_PREFIX.length).replace(new RegExp(`[${KEY_ALPHABET}]`, 'g'), ''))];
    if (odd.length) problems.push(`it has characters a call4me key never contains: ${JSON.stringify(odd.join(''))}`);
  }
  return `${got}: ${problems.join('; ')}`;
}

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
