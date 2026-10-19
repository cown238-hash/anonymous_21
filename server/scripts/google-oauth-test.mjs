/**
 * Checks the Google sign-in wiring without a Google account.
 *
 * What can be proven from the outside:
 *
 *   - the provider probe the client uses to decide whether to draw the button
 *   - the guard that keeps the feature off when no credentials are configured
 *   - that /start leaves for accounts.google.com with PKCE + state and a
 *     correctly scoped flow cookie
 *   - that the callback refuses a missing, forged, expired or mismatched flow
 *     cookie by redirecting to the login page, never by returning JSON
 *   - that a real state with a bogus code reaches Google and fails politely
 *
 * What it deliberately does not do is complete a sign-in — that needs a real
 * Google account and a browser. The token exchange below is expected to be
 * rejected by Google, which is the point: the failure path is what is tested.
 *
 *   node scripts/google-oauth-test.mjs
 *
 * Runs against a live server, like age-gate-test.mjs.
 */
const base = process.env.TEST_BASE ?? 'http://localhost:4000/api';
const FLOW_COOKIE = 'nimbus_google_flow';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/** First matching Set-Cookie entry, or null. */
function setCookie(res, name) {
  const list =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? ''];
  return list.find((entry) => entry.split(';')[0].trim().startsWith(`${name}=`)) ?? null;
}

function cookieValue(entry) {
  if (!entry) return null;
  const pair = entry.split(';')[0].trim();
  return pair.slice(pair.indexOf('=') + 1);
}

const get = (path, init = {}) =>
  fetch(`${base}${path}`, { redirect: 'manual', ...init });

/** Query parameters of a Location header, for asserting on redirects. */
function locationParams(res) {
  const location = res.headers.get('location');
  if (!location) return { location: null, params: new URLSearchParams() };
  try {
    return { location, params: new URL(location).searchParams };
  } catch {
    return { location, params: new URLSearchParams() };
  }
}

async function main() {
  console.log('\nGoogle sign-in');

  const providers = await get('/auth/providers');
  check('/auth/providers answers', providers.status === 200, `HTTP ${providers.status}`);
  const body = await providers.json().catch(() => null);
  const enabled = body?.data?.google === true;
  check('provider probe reports a boolean', typeof body?.data?.google === 'boolean');

  const start = await get('/auth/google/start');
  const startCookie = setCookie(start, FLOW_COOKIE);

  if (!enabled) {
    console.log('  (credentials not configured — checking the closed path)');
    check('/start refuses when unconfigured', start.status === 503, `HTTP ${start.status}`);
    check('/start sets no flow cookie', startCookie === null);

    const callback = await get('/auth/google/callback?code=x&state=y');
    const { params } = locationParams(callback);
    check(
      '/callback redirects instead of erroring',
      callback.status === 302 && params.get('google') === 'disabled',
      `${callback.status} ${params.get('google') ?? ''}`,
    );
    return;
  }

  console.log('  (credentials configured — checking the live path)');

  // --- /start -------------------------------------------------------------
  check('/start redirects to Google', start.status === 302, `HTTP ${start.status}`);
  const { location, params } = locationParams(start);
  check(
    'redirect target is accounts.google.com',
    Boolean(location?.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')),
    location?.split('?')[0] ?? 'no location',
  );
  check('asks for openid/email/profile', params.get('scope') === 'openid email profile');
  check('uses the code response type', params.get('response_type') === 'code');
  check('sends a PKCE S256 challenge', params.get('code_challenge_method') === 'S256' && Boolean(params.get('code_challenge')));
  check('sends a state', Boolean(params.get('state')));
  check('has a redirect_uri', Boolean(params.get('redirect_uri')));
  check('does not leak the client secret', !params.has('client_secret'));

  check('sets the flow cookie', Boolean(startCookie));
  check('flow cookie is HttpOnly', /; *HttpOnly/i.test(startCookie ?? ''));
  check('flow cookie is SameSite=Lax', /; *SameSite=Lax/i.test(startCookie ?? ''));
  check('flow cookie is scoped to the callback', /; *Path=\/api\/auth\/google/i.test(startCookie ?? ''));

  const cookie = `${FLOW_COOKIE}=${cookieValue(startCookie)}`;
  const state = params.get('state') ?? '';

  // --- /callback, rejection paths ----------------------------------------
  const noCookie = await get(`/auth/google/callback?code=x&state=${encodeURIComponent(state)}`);
  check(
    'callback without the flow cookie is refused',
    noCookie.status === 302 && locationParams(noCookie).params.get('google') === 'state',
    locationParams(noCookie).params.get('google') ?? '',
  );

  const forged = await get('/auth/google/callback?code=x&state=y', {
    headers: { cookie: `${FLOW_COOKIE}=not-a-token` },
  });
  check(
    'callback with a forged cookie is refused',
    forged.status === 302 && locationParams(forged).params.get('google') === 'expired',
    locationParams(forged).params.get('google') ?? '',
  );

  const mismatched = await get(
    `/auth/google/callback?code=x&state=${encodeURIComponent(`${state}-tampered`)}`,
    { headers: { cookie } },
  );
  check(
    'callback with a mismatched state is refused',
    mismatched.status === 302 && locationParams(mismatched).params.get('google') === 'state',
    locationParams(mismatched).params.get('google') ?? '',
  );

  const denied = await get('/auth/google/callback?error=access_denied', { headers: { cookie } });
  check(
    'cancelling at Google lands back on /login',
    denied.status === 302 && locationParams(denied).params.get('google') === 'cancelled',
    locationParams(denied).params.get('google') ?? '',
  );

  // --- /callback, the real state with a code Google will reject -----------
  const expired = await get(`/auth/google/callback?code=not-a-real-code&state=${encodeURIComponent(state)}`, {
    headers: { cookie },
  });
  check(
    'a rejected code is reported as failed, not as a crash',
    expired.status === 302 && locationParams(expired).params.get('google') === 'failed',
    `${expired.status} ${locationParams(expired).params.get('google') ?? ''}`,
  );
  check('the flow cookie is cleared afterwards', /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(setCookie(expired, FLOW_COOKIE) ?? ''));
  check(
    'failed flows never land on the API itself',
    Boolean(locationParams(expired).location?.includes('/login')),
    locationParams(expired).location ?? '',
  );
}

main()
  .catch((err) => {
    console.error(err);
    fail += 1;
  })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  });
