import Stripe from 'stripe';
import { config } from './config';
import { createApp } from './app';
import { sendLicenseEmail } from './email';
import { signLicense } from './signing';

const stripe = new Stripe(config.stripeSecretKey);

const app = createApp({
  stripe,
  webhookSecret: config.stripeWebhookSecret,
  signLicense,
  sendLicenseEmail,
});

app.listen(config.port, () => {
  console.log(`tldr-server (one-time licenses) listening on :${config.port}`);
});
