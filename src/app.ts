// Express app factory. Dependencies are injected so tests can substitute
// fakes for Stripe and email delivery.
import express from 'express';
import type Stripe from 'stripe';

export interface AppDeps {
  stripe: Pick<Stripe, 'webhooks' | 'checkout'>;
  webhookSecret: string;
  signLicense: (email: string, orderId: string, iat: number) => string;
  sendLicenseEmail: (to: string, licenseKey: string) => Promise<void>;
}

export const createApp = (deps: AppDeps): express.Express => {
  const app = express();

  app.get('/health', (_req, res) => res.json({ ok: true, model: 'one-time-license' }));

  // --- Stripe webhooks -----------------------------------------------------
  // NOTE: this route must see the raw body for signature verification, so it
  // is registered before any JSON body parser and uses express.raw.
  app.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    let event: Stripe.Event;
    try {
      const sig = req.headers['stripe-signature'];
      if (!sig) return res.status(400).send('missing signature');
      event = deps.stripe.webhooks.constructEvent(req.body as Buffer, sig, deps.webhookSecret);
    } catch {
      return res.status(400).send('bad signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      // One-time purchase only: Payment Links in payment mode. Subscriptions
      // are not part of this model.
      if (session.mode === 'payment' && session.payment_status === 'paid') {
        const email = session.customer_details?.email;
        if (email && session.id && session.created) {
          const key = deps.signLicense(email, session.id, session.created);
          deps.sendLicenseEmail(email, key).catch((e) =>
            console.error('license email error', e),
          );
        } else {
          console.error('checkout.session.completed missing email/id/created');
        }
      }
    } else if (event.type === 'charge.refunded') {
      // One-time licenses are verified offline, so a refunded key cannot be
      // remotely revoked. Log it for manual follow-up (see README).
      const charge = event.data.object as Stripe.Charge;
      const pi = charge.payment_intent;
      console.warn('refund issued; license cannot be auto-revoked', {
        charge: charge.id,
        paymentIntent: typeof pi === 'string' ? pi : pi?.id,
      });
    }

    res.json({ received: true });
  });

  // --- Post-purchase page: shows the buyer their license key ---------------
  // The payload is deterministic (email + session id + session timestamp),
  // so this page can re-derive the same license the webhook emailed, with
  // no database.
  app.get('/thanks', async (req, res) => {
    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
    if (!sessionId) return res.status(400).send('missing session_id');
    try {
      const session = await deps.stripe.checkout.sessions.retrieve(sessionId);
      const email = session.customer_details?.email;
      const key =
        email && session.created ? deps.signLicense(email, session.id, session.created) : null;
      res.send(
        `<!doctype html><html><body style="font-family:system-ui;max-width:560px;margin:40px auto">` +
          `<h1>You're in</h1>` +
          (key
            ? `<p>Your lifetime license key (also emailed to you):</p>` +
              `<p><code style="font-size:16px;word-break:break-all">${key}</code></p>` +
              `<p>Paste it into the tldr extension settings to unlock it.</p>`
            : `<p>Your key is on its way to your inbox. If it doesn't arrive, contact support.</p>`) +
          `</body></html>`,
      );
    } catch {
      res.status(400).send('unknown session');
    }
  });

  return app;
};
