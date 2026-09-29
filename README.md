# tldr-server

Metered API backend for the tldr YouTube summarizer extension. Turns the
extension into freemium: free users keep bringing their own API key (zero cost),
Pro users pay and get summaries through this server's hosted key.

## How it works

- `POST /v1/summarize` — bearer license key, `{title, transcript}` in,
  `{summary}` out. Enforces active subscription + daily fair-use cap.
- `GET /v1/license` — validate a key (used by the extension's Activate button).
- `POST /v1/portal` — Stripe customer-portal URL so users can cancel/manage.
- `POST /stripe/webhook` — creates a license on `checkout.session.completed`
  and emails the raw key; deactivates on subscription end.
- `GET /thanks?session_id=...` — post-purchase landing page.

License keys are `tldr_` + 48 hex chars. Only SHA-256 hashes are stored.

## Setup

1. `npm install && npm run build`
2. Create a Stripe product + recurring price ($4.99/mo or $39/yr), then a
   **Payment Link** for it. Set the link's success URL to
   `https://<your-host>/thanks?session_id={CHECKOUT_SESSION_ID}`.
3. In Stripe dashboard, add a webhook endpoint
   `https://<your-host>/stripe/webhook` listening for
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
4. Optional but recommended: a [Resend](https://resend.com) API key so the
   license key is emailed instantly at checkout.
5. Set env vars and run:

```sh
PORT=3000
DATABASE_PATH=./tldr.db
BASE_URL=https://<your-host>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
LLM_API_KEY=...            # your Gemini / OpenAI-compatible key
LLM_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_MODEL=gemini-3.8-flash
DAILY_CAP=100              # fair-use summaries per license per day
MAX_TRANSCRIPT_CHARS=60000
RESEND_API_KEY=re_...      # optional
FROM_EMAIL=tldr <pro@yourdomain.com>   # optional
npm start
```

Deploys as a single Node process with a local SQLite file. Good for the first
thousands of users; move to Postgres when the DB outgrows one box.

## Extension wiring

In the extension's settings, `apiBaseUrl` points at this server
(default `https://<your-host>`). A filled license key routes summaries through
`/v1/summarize`; empty means the existing bring-your-own-key path.
