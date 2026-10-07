/**
 * TOTP verification checks. No server, no database — the clock is pinned on the
 * otplib instance so step boundaries are hit exactly rather than by sleeping.
 *
 * The bug this guards: otplib's `verify({ token, secret })` ignores a `window`
 * in the argument object, so `window: 1` passed at the call site did nothing and
 * verification ran at the library default of `window: 0`. A code was then valid
 * only during the exact 30-second step it was minted in, and the login route —
 * which spends a few hundred milliseconds in bcrypt first — rejected codes typed
 * correctly. That surfaced as an intermittent "invalid verification code".
 *
 * Usage: npx tsx scripts/totp-test.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pkg from 'otplib';

const { authenticator } = pkg;
const here = path.dirname(fileURLToPath(import.meta.url));
const { verifyTotp } = await import(
  pathToFileURL(path.resolve(here, '..', 'src', 'services', 'two-factor.ts')).href
);

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const STEP = 30_000;
const BASE = 1_700_000_010_000; // fixed instant, far enough in the past to be stable
const secret = authenticator.generateSecret(32);

/**
 * Runs `fn` with the library clock pinned. Both `generate` and `check` read the
 * instant from the instance options, so this is the only seam available.
 */
function withClock(epochMs, fn) {
  const saved = authenticator.options;
  authenticator.options = { ...saved, epoch: epochMs };
  try {
    return fn();
  } finally {
    authenticator.options = saved;
  }
}

/** The code a correct client would be showing at `epochMs`. */
const codeAt = (epochMs) => withClock(epochMs, () => authenticator.generate(secret));

/** What `verifyTotp` would answer if the server's clock read `epochMs`. */
const verifyAt = (epochMs, token) => withClock(epochMs, () => verifyTotp(secret, token));

console.log('\n\x1b[1m▸ The window is actually applied\x1b[0m');
check('instance window is 1', authenticator.allOptions().window === 1, `window=${authenticator.allOptions().window}`);

// Prove the instance option is what drives the decision, not a call argument:
// the same code, the same clock, only the window differs.
{
  const minted = BASE;
  const code = codeAt(minted);
  const checkedAt = minted + STEP + 400; // just into the following step

  const strict = withClock(checkedAt, () => {
    authenticator.options = { ...authenticator.options, window: 0 };
    try {
      return !verifyTotp(secret, code);
    } finally {
      authenticator.options = { ...authenticator.options, window: 1 };
    }
  });
  const lenient = withClock(checkedAt, () => verifyTotp(secret, code));

  check('window 0 rejects and window 1 accepts the same code', strict && lenient, `strict=${strict} lenient=${lenient}`);
}

console.log('\n\x1b[1m▸ The boundary that used to fail\x1b[0m');
const nearEnd = BASE + STEP - 200;
check(
  'code minted at the tail of a step survives the rollover',
  verifyAt(nearEnd + 400, codeAt(nearEnd)),
  `minted ${nearEnd % STEP}ms in, verified ${(nearEnd + 400) % STEP}ms in`,
);
// Window 1 covers one step either side, so a code survives exactly one rollover
// and no more — that bound is what keeps the widened window from being a hole.
check('code from two steps back is rejected', !verifyAt(BASE + 2 * STEP + 100, codeAt(BASE)));
check('code from three steps back is rejected', !verifyAt(BASE + 3 * STEP + 100, codeAt(BASE)));

console.log('\n\x1b[1m▸ Clock drift\x1b[0m');
check('client 20s fast still works', verifyAt(BASE, codeAt(BASE + 20_000)));
check('client 20s slow still works', verifyAt(BASE, codeAt(BASE - 20_000)));
check('client 5 minutes off does not', !verifyAt(BASE, codeAt(BASE + 300_000)));

console.log('\n\x1b[1m▸ Malformed input\x1b[0m');
for (const bad of ['', 'abc', '12345', '1234567', '12 34 56 78', '๑๒๓๔๕๖', '000000x', '  ']) {
  check(`rejects ${JSON.stringify(bad)}`, verifyAt(BASE, bad) === false);
}

console.log('\n\x1b[1m▸ Whitespace tolerance\x1b[0m');
const live = codeAt(BASE);
check('a spaced code is accepted', verifyAt(BASE, `${live.slice(0, 3)} ${live.slice(3)}`));

console.log('\n\x1b[1m▸ Wrong secret\x1b[0m');
const otherSecret = authenticator.generateSecret(32);
check('a code from another secret is refused', withClock(BASE, () => authenticator.verify({ token: live, secret: otherSecret })) === false);

console.log('\n\x1b[1m▸ A full cycle, worst-case timing\x1b[0m');
let rejected = 0;
for (let step = 0; step < 20; step++) {
  const minted = BASE + step * STEP;
  // Always verify at the very end of the following step — the case that failed.
  if (!verifyAt(minted + STEP + 20, codeAt(minted))) rejected++;
}
check('all 20 codes verify one step late', rejected === 0, `${rejected} rejected`);

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
