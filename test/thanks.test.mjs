// /thanks page tests: deterministic license re-derivation with no database.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { createApp } from '../dist/app.js';
import { signLicense } from '../dist/signing.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.LICENSE_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });

const fakeStripe = {
  webhooks: {
    constructEvent: () => {
      throw new Error('not used here');
    },
  },
  checkout: {
    sessions: {
      retrieve: async (id) => {
        if (id === 'cs_known') {
          return { id, customer_details: { email: 'buyer@example.com' }, created: 1759100000 };
        }
        throw new Error('not found');
      },
    },
  },
};

const app = createApp({
  stripe: fakeStripe,
  webhookSecret: 'whsec_test',
  signLicense,
  sendLicenseEmail: async () => {},
});

let base;
let server;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const extractKey = (html) => {
  const m = /tldr1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.exec(html);
  return m ? m[0] : null;
};

describe('thanks page', () => {
  it('shows a verifiable license key for a known session', async () => {
    const res = await fetch(`${base}/thanks?session_id=cs_known`);
    assert.equal(res.status, 200);
    const key = extractKey(await res.text());
    assert.ok(key, 'page contains a license key');
    const parts = key.split('.');
    const jwk = publicKey.export({ format: 'jwk' });
    const pub = await webcrypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      Buffer.from(parts[2], 'base64url'),
      new TextEncoder().encode(`tldr1.${parts[1]}`),
    );
    assert.equal(ok, true);
  });

  it('400s without session_id', async () => {
    const res = await fetch(`${base}/thanks`);
    assert.equal(res.status, 400);
  });

  it('400s for an unknown session', async () => {
    const res = await fetch(`${base}/thanks?session_id=cs_nope`);
    assert.equal(res.status, 400);
  });
});
