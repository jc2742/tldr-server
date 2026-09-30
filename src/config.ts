// Runtime configuration, all from environment variables.
const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
};

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  stripeSecretKey: required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: required('STRIPE_WEBHOOK_SECRET'),
};
// LICENSE_SIGNING_KEY (PEM) is read lazily by src/signing.ts so tests can
// inject it via process.env. RESEND_API_KEY / FROM_EMAIL are optional
// (see src/email.ts).
