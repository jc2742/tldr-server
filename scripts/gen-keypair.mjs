// Generates a fresh P-256 license signing keypair.
//   Public JWK  -> paste into the extension's src/license.ts (LICENSE_PUBLIC_JWK).
//   Private PEM -> LICENSE_SIGNING_KEY env var on the server. Keep it secret;
//                  anyone with it can mint valid licenses.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = publicKey.export({ format: 'jwk' });

console.log('--- PUBLIC JWK (extension src/license.ts) ---');
console.log(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }));
console.log('--- PRIVATE PEM (server LICENSE_SIGNING_KEY, keep secret) ---');
console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }).trim());
