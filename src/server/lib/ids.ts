const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short, URL-safe, unguessable id (default 16 chars ≈ 83 bits). */
export function newId(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function newToken(): string {
  return newId(32);
}


export const now = () => Date.now();
