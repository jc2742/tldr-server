# tldr-server

License issuance backend for the tldr YouTube summarizer extension, built
for the one-time purchase model. It does exactly one job: turn a Stripe
one-time checkout into a signed, offline-verifiable license key and email it
to the buyer.

There is no database, no metering, and no hosted summarization. The
extension verifies license keys locally (ECDSA P-256 signature against the
public key baked into `src/license.ts`), and summaries run on the buyer's
own AI API key. This server never sees transcripts.

## How it works

- `POST /stripe/webhook` — on `checkout.session.completed` (one-time
  payment, `payment_status=paid`), signs a license for
  `{email, order: session.id, iat: session.created}` and emails it via
  Resend. The payload is deterministic, so the key can be re-derived.
- `GET /thanks?session_id=...` — post-purchase page. Re-derives the same
  license from the Stripe session and shows it to the buyer (backup in case
  the email bounces).
- `GET /health` — `{ ok: true }`.

License keys look like `tldr1.<base64url(payload)>.<base64url(signature)>`.

## Setup

1. `npm install`
2. Generate a signing keypair: `node scripts/gen-keypair.mjs`
   - Paste the public JWK into the extension's `src/license.ts`
     (`LICENSE_PUBLIC_JWK`).
   - Keep the private PEM secret. It becomes the `LICENSE_SIGNING_KEY` env
     var below. Anyone with it can mint valid licenses.
3. In Stripe, create a **product with a one-time price**, then a **Payment
   Link** for it. Set the link's success URL to
   `https://<your-host>/thanks?session_id={CHECKOUT_SESSION_ID}`.
4. In Stripe, add a webhook endpoint `https://<your-host>/stripe/webhook`
   listening for `checkout.session.completed` and `charge.refunded`.
5. Optional but recommended: a [Resend](https://resend.com) API key so the
   license key is emailed instantly at checkout.
6. Set env vars and run:

```sh
PORT=3000
BASE_URL=https://<your-host>
STRIPE_SECRET_KEY=<redacted>
STRIPE_WEBHOOK_SECRET=<redacted>
LICENSE_SIGNING_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
# optional:
RESEND_API_KEY=<redacted>
FROM_EMAIL=tldr <noreply@yourdomain.com>

npm start
```

Deploy anywhere Node runs (Fly.io, Render, a VPS). The process is
stateless, so a single small instance is fine.

## Manual issuance

For comps, manual orders, or support:

```sh
npm run build
LICENSE_SIGNING_KEY="$(cat license-signing-key.pem)" \
  node scripts/issue-license.mjs buyer@example.com ORDER123
```

## Notes

- **Refunds can't auto-revoke.** One-time licenses are verified offline, so
  there is nothing server-side to turn off. `charge.refunded` is logged for
  manual follow-up. For a low-price one-time tool this is the standard
  tradeoff; if abuse ever matters, add a denylist endpoint and have the
  extension check it periodically.
- **Key rotation:** generate a new keypair, update `LICENSE_PUBLIC_JWK` in
  the extension, ship the update, then switch `LICENSE_SIGNING_KEY`. Keys
  minted with the old key stop verifying once users update.
- **Tests:** `npm test` (builds, then runs webhook + thanks-page tests with
  ephemeral keypairs).
