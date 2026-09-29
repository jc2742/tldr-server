import express from 'express';
import Stripe from 'stripe';
import { config } from './config';
import {
  checkAndCountUsage,
  createLicense,
  deactivateBySubscription,
  findLicense,
  licenseBySubscription,
} from './licenses';
import { sendLicenseEmail } from './email';
import { summarizeWithHostedKey } from './llm';

const stripe = new Stripe(config.stripeSecretKey);
const app = express();

const bearerKey = (req: express.Request): string | null => {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? (m[1] ?? '').trim() || null : null;
};

app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Metered summary proxy -------------------------------------------------
app.post('/v1/summarize', express.json({ limit: '2mb' }), async (req, res) => {
  const key = bearerKey(req);
  if (!key) return res.status(401).json({ error: 'missing license key' });

  const license = findLicense(key);
  if (!license || license.status !== 'active') {
    return res.status(401).json({ error: 'invalid or inactive license key' });
  }

  const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 500) : '';
  let transcript = typeof req.body?.transcript === 'string' ? req.body.transcript : '';
  if (!transcript.trim()) {
    return res.status(400).json({ error: 'transcript is required' });
  }
  transcript = transcript.slice(0, config.maxTranscriptChars);

  if (!checkAndCountUsage(key)) {
    return res.status(429).json({ error: 'daily summary limit reached' });
  }

  try {
    const summary = await summarizeWithHostedKey(title, transcript);
    res.json({ summary });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'summarization failed' });
  }
});

// --- License status (used by the extension's Activate button) ---------------
app.get('/v1/license', (req, res) => {
  const key = bearerKey(req);
  if (!key) return res.status(401).json({ error: 'missing license key' });
  const license = findLicense(key);
  if (!license) return res.status(404).json({ error: 'unknown license key' });
  res.json({ plan: license.plan, status: license.status });
});

// --- Customer portal (manage / cancel subscription) ------------------------
app.post('/v1/portal', express.json(), async (req, res) => {
  const key = bearerKey(req);
  if (!key) return res.status(401).json({ error: 'missing license key' });
  const license = findLicense(key);
  if (!license?.stripe_customer_id) {
    return res.status(404).json({ error: 'no billing record for this license' });
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: license.stripe_customer_id,
    return_url: config.baseUrl + '/thanks',
  });
  res.json({ url: session.url });
});

// --- Stripe webhooks -------------------------------------------------------
// NOTE: this route must see the raw body for signature verification, so it is
// registered before any JSON body parser and uses express.raw.
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'] as string,
      config.stripeWebhookSecret,
    );
  } catch {
    return res.status(400).send('bad signature');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    if (subscriptionId && !licenseBySubscription(subscriptionId)) {
      const key = createLicense({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });
      // Email the raw key now: only the hash is stored, so this is the one
      // moment the plaintext exists.
      const email = session.customer_details?.email;
      if (email) {
        sendLicenseEmail(email, key).catch((e) =>
          console.error('license email error', e),
        );
      }
    }
  } else if (event.type === 'customer.subscription.deleted') {
    deactivateBySubscription((event.data.object as Stripe.Subscription).id);
  } else if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
      deactivateBySubscription(sub.id);
    }
  }

  res.json({ received: true });
});

// --- Post-purchase page: shows the buyer their license key -----------------
app.get('/thanks', async (req, res) => {
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  if (!sessionId) return res.status(400).send('missing session_id');
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    const license = subscriptionId ? licenseBySubscription(subscriptionId) : undefined;
    res.send(
      `<!doctype html><html><body style="font-family:system-ui;max-width:560px;margin:40px auto">` +
        `<h1>You're Pro</h1>` +
        `<p>Your license key was emailed to you. Paste it into the tldr extension ` +
        `settings to activate unlimited summaries.</p>` +
        (license
          ? ``
          : `<p>Still generating your key? Give it a minute, then check your inbox ` +
            `(reference <code>${subscriptionId || sessionId}</code>).</p>`) +
        `</body></html>`,
    );
  } catch {
    res.status(400).send('unknown session');
  }
});

app.listen(config.port, () => {
  console.log(`tldr-server listening on :${config.port}`);
});
