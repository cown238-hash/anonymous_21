/**
 * Prints a current TOTP code for a base32 secret.
 *
 * Used to drive the 2FA enrolment UI by hand:
 *   node scripts/totp.mjs <base32-secret>
 */
import { authenticator } from 'otplib';

const secret = process.argv[2];
if (!secret) {
  console.error('usage: node scripts/totp.mjs <base32-secret>');
  process.exit(1);
}

const code = authenticator.generate(secret);
console.log(code);
// Keep the 30s window visible so a human can paste it in time.
const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
console.error(`expires in ${secondsLeft}s`);