import { createHash, randomBytes } from 'node:crypto';
import { db, type LicenseRow } from './db';
import { config } from './config';

const hashKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');

export const generateLicenseKey = (): string =>
  'tldr_' + randomBytes(24).toString('hex');

export const createLicense = (opts: {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan?: string;
}): string => {
  const key = generateLicenseKey();
  db.prepare(
    `INSERT INTO licenses (key_hash, plan, status, stripe_customer_id, stripe_subscription_id)
     VALUES (?, ?, 'active', ?, ?)`,
  ).run(hashKey(key), opts.plan || 'pro', opts.stripeCustomerId || null, opts.stripeSubscriptionId || null);
  return key;
};

export const findLicense = (key: string): LicenseRow | undefined => {
  const row = db
    .prepare('SELECT * FROM licenses WHERE key_hash = ?')
    .get(hashKey(key)) as LicenseRow | undefined;
  return row;
};

export const deactivateBySubscription = (subscriptionId: string): void => {
  db.prepare(
    `UPDATE licenses SET status = 'canceled', updated_at = datetime('now')
     WHERE stripe_subscription_id = ?`,
  ).run(subscriptionId);
};

export const licenseBySubscription = (subscriptionId: string): LicenseRow | undefined => {
  return db
    .prepare('SELECT * FROM licenses WHERE stripe_subscription_id = ?')
    .get(subscriptionId) as LicenseRow | undefined;
};

const today = (): string => new Date().toISOString().slice(0, 10);

/** Increments today's usage. Returns false when the daily cap is hit. */
export const checkAndCountUsage = (key: string): boolean => {
  const keyHash = hashKey(key);
  const row = db
    .prepare('SELECT count FROM usage WHERE key_hash = ? AND day = ?')
    .get(keyHash, today()) as { count: number } | undefined;
  const count = row?.count || 0;
  if (count >= config.dailyCap) return false;
  db.prepare(
    `INSERT INTO usage (key_hash, day, count) VALUES (?, ?, 1)
     ON CONFLICT (key_hash, day) DO UPDATE SET count = count + 1`,
  ).run(keyHash, today());
  return true;
};
