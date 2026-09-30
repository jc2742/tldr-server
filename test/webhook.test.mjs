// Webhook tests: signature verification, one-time license issuance, and the
// health check. Run with: npm test (builds first; tests import from dist/).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import Stripe from 'stripe';
import { createApp } from '../dist/app.js';
import { signLicense } from '../dist/signing.js';

// Ephemeral signing key for this test run.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.LICENSE_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });

const stripe = new Stripe('sk_test_dummy');
const WEBHOOK_SECRET = 'whsec_test';

const sent = [];
const app = createApp({
  stripe,
  webhookSecret: WEBHOOK_SECRET,
  signLicense,
  sendLicenseEmail: async (to, key) => {
    sent.push({ to, key });
  },
});

let base;
let server;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const stripeEvent = (type, object) => ({
  id: 'evt_test',
  object: 'event',
  type,
  data: { object },
});

const postWebhook = async (event, secret = WEBHOOK_SECRET) => {
  const payload = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return fetch(`${base}/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    body: payload,
  });
};

const verifyKey = async (key) => {
  const parts = key.split('.');
  const jwk = publicKey.export({ format: 'jwk' });
  const pub = await webcrypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  return webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pub,
    Buffer.from(parts[2], 'base64url'),
    new TextEncoder().encode(`tldr1.${parts[1]}`),
  );
};

describe('stripe webhook', () => {
  it('rejects a bad signature with 400', async () => {
    const res = await postWebhook(stripeEvent('checkout.session.completed', {}), 'whsec_wrong');
    assert.equal(res.status, 400);
  });

  it('issues and emails a license on one-time checkout completion', async () => {
    const session = {
      id: 'cs_test_123',
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      customer_details: { email: 'buyer@example.com' },
      created: 1759100000,
    };
    const res = await postWebhook(stripeEvent('checkout.session.completed', session));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'buyer@example.com');
    assert.match(sent[0].key, /^tldr1\./);
    assert.equal(await verifyKey(sent[0].key), true);
    const payload = JSON.parse(Buffer.from(sent[0].key.split('.')[1], 'base64url').toString());
    assert.deepEqual(payload, {
      v: 1,
      email: 'buyer@example.com',
      order: 'cs_test_123',
      iat: 1759100000,
    });
  });

  it('ignores subscription-mode checkouts', async () => {
    sent.length = 0;
    const session = {
      id: 'cs_test_sub',
      object: 'checkout.session',
      mode: 'subscription',
      payment_status: 'paid',
      customer_details: { email: 'sub@example.com' },
      created: 1759100000,
      subscription: 'sub_123',
    };
    const res = await postWebhook(stripeEvent('checkout.session.completed', session));
    assert.equal(res.status, 200);
    assert.equal(sent.length, 0);
  });

  it('answers the health check', async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, model: 'one-time-license' });
  });
});
