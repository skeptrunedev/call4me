import { describe, expect, it } from 'vitest';
import { clientState, personClientState, readClientState, verifyTelnyxSignature } from '../src/server/lib/telnyx';

const b64 = (buf: ArrayBuffer | JsonWebKey) => Buffer.from(buf as ArrayBuffer).toString('base64');

describe('verifyTelnyxSignature', async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publicKeyB64 = b64(await crypto.subtle.exportKey('raw', pair.publicKey));
  const body = '{"data":{"event_type":"call.answered"}}';
  const ts = '1790000000';
  const signatureB64 = b64(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(`${ts}|${body}`)));
  const nowMs = 1790000000 * 1000 + 10_000;

  it('accepts a valid signature', async () => expect(await verifyTelnyxSignature({ publicKeyB64, signatureB64, timestamp: ts, body, nowMs })).toBe(true));
  it('rejects a tampered body', async () => expect(await verifyTelnyxSignature({ publicKeyB64, signatureB64, timestamp: ts, body: body + ' ', nowMs })).toBe(false));
  it('rejects a stale timestamp', async () => expect(await verifyTelnyxSignature({ publicKeyB64, signatureB64, timestamp: ts, body, nowMs: nowMs + 3_600_000 })).toBe(false));
  it('rejects a missing signature', async () => expect(await verifyTelnyxSignature({ publicKeyB64, signatureB64: undefined, timestamp: ts, body, nowMs })).toBe(false));
});

describe('client state', () => {
  it('round-trips the call id', () => expect(readClientState(clientState('call_abc'))).toEqual({ callId: 'call_abc', personLeg: false }));
  it("marks the person's own leg so its hang-up never ends the call", () => expect(readClientState(personClientState('call_abc'))).toEqual({ callId: 'call_abc', personLeg: true }));
  it('tolerates junk', () => expect(readClientState('%%%')).toBeNull());
});
