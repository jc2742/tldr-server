// Offline-verifiable license signing (ECDSA P-256 / SHA-256).
//
// A license key looks like: tldr1.<base64url(payload)>.<base64url(signature)>
// The payload is JSON: { v: 1, email, order, iat }. The signature covers the
// ASCII string "tldr1.<payload>" in raw 64-byte (r || s) form. The extension
// verifies keys locally against the baked-in public key, so the server never
// needs a database and buyers can activate offline.
//
// The private key comes from the LICENSE_SIGNING_KEY env var (PEM). It is
// read lazily so tests can inject it via process.env before first use.
import {
  createPrivateKey,
  createPublicKey,
  sign,
  type KeyObject,
} from 'node:crypto';

let cached: KeyObject | null = null;

const getPrivateKey = (): KeyObject => {
  if (cached) return cached;
  const pem = process.env.LICENSE_SIGNING_KEY;
  if (!pem) throw new Error('missing required env var LICENSE_SIGNING_KEY');
  // Env vars often carry literal "\n" sequences when pasted from a file.
  cached = createPrivateKey(pem.replace(/\\n/g, '\n'));
  return cached;
};

const b64url = (b: Buffer): string => b.toString('base64url');

export interface LicensePayload {
  v: 1;
  email: string;
  order: string;
  iat: number; // unix seconds
}

export const buildLicensePayload = (
  email: string,
  orderId: string,
  iat: number,
): LicensePayload => ({ v: 1, email, order: orderId, iat });

/** Signs a license key. Deterministic payload in, verifiable key out. */
export const signLicense = (email: string, orderId: string, iat: number): string => {
  const p = b64url(Buffer.from(JSON.stringify(buildLicensePayload(email, orderId, iat))));
  const sig = sign('sha256', Buffer.from(`tldr1.${p}`), {
    key: getPrivateKey(),
    dsaEncoding: 'ieee-p1363',
  });
  return `tldr1.${p}.${b64url(sig)}`;
};

/**
 * Public JWK matching the private key. Paste the output into the
 * extension's src/license.ts (LICENSE_PUBLIC_JWK) when rotating keys.
 */
export const publicJwk = (): JsonWebKey =>
  createPublicKey(getPrivateKey()).export({ format: 'jwk' }) as JsonWebKey;
