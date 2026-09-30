// Mint a license key manually (comps, manual orders, support).
// Build first: npm run build
// Usage: LICENSE_SIGNING_KEY="$(cat license-signing-key.pem)" \
//          node scripts/issue-license.mjs buyer@example.com ORDER123
import { signLicense } from '../dist/signing.js';

const [email, order] = process.argv.slice(2);
if (!email || !order) {
  console.error('usage: node scripts/issue-license.mjs <email> <order-id>');
  process.exit(1);
}
console.log(signLicense(email, order, Math.floor(Date.now() / 1000)));
