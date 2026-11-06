import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Resolve the `server/` package root from this module's own location rather
 * than `process.cwd()`, so the app behaves the same whether it is started
 * from the repo root (`npm start`) or from inside `server/`.
 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * ENV_FILE picks the env file explicitly, which is how the production runner
 * points at `server/.env.production` without having to overwrite `.env` while
 * the server boots.
 */
const explicit = process.env.ENV_FILE?.trim();
const candidates = explicit
  ? [path.resolve(packageRoot, '..', explicit), path.resolve(explicit)]
  : [
      path.join(packageRoot, '.env'),
      path.resolve(process.cwd(), 'server', '.env'),
      path.resolve(process.cwd(), '.env'),
    ];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    if (explicit) {
      console.info(`[env] loaded ${candidate}`);
    }
    break;
  }
}

if (explicit && !candidates.some((c) => fs.existsSync(c))) {
  throw new Error(`ENV_FILE points at a file that does not exist: ${process.env.ENV_FILE}`);
}

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

/**
 * The shipped `.env` templates list optional keys as bare `KEY=` placeholders,
 * so a blank value has to mean "not configured" rather than "empty string".
 * Without this, an empty `SMTP_PORT` coerces to 0, fails `positive()`, and the
 * server refuses to boot on a config nobody considers wrong.
 */
const blankToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const blank = z.preprocess(blankToUndefined, z.string().optional());

const blankPort = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().positive().optional(),
);

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
  PUBLIC_URL: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  /// Files per multi-upload request. Attachments are capped separately from the
  /// single-file cover upload, which still allows one image at MAX_UPLOAD_MB.
  MAX_FILES_PER_UPLOAD: z.coerce.number().int().min(1).max(20).default(10),
  /// Attachments a single post may carry once saved.
  MAX_ATTACHMENTS_PER_POST: z.coerce.number().int().min(1).max(50).default(20),
  /// Chunk size for the resumable large-file upload path. Small enough to pass
  /// any proxy in front of the app.
  UPLOAD_CHUNK_MB: z.coerce.number().int().min(2).max(40).default(16),
  /// Total size one chunked upload may reach. This is how files far bigger than
  /// the small-request upload cap (e.g. 1 GB videos) get through.
  MAX_CHUNKED_UPLOAD_MB: z.coerce.number().int().min(50).max(10240).default(1024),

  TRUST_PROXY: bool,
  /// How many reverse proxies stand in front of the app, which is what makes
  /// `X-Forwarded-For` resolvable to the real visitor. 1 = one proxy (Caddy on
  /// the same VM); 2 = Cloudflare in front of that proxy. Getting this wrong
  /// makes the rate limiter key on someone else's IP — the edge address
  /// instead of the visitor's — so a handful of users can exhaust the budget
  /// for everybody on that hop.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ---- Email (SMTP). Unset -> emails are written to the log instead. ----
  SMTP_HOST: blank,
  SMTP_PORT: blankPort,
  SMTP_SECURE: bool,
  SMTP_USER: blank,
  SMTP_PASS: blank,
  MAIL_FROM: z.string().default('WKSL <no-reply@nimbus.local>'),

  // ---- Feature toggles ----
  EMAIL_VERIFICATION_REQUIRED: bool,
  TWO_FACTOR_ISSUER: z.string().default('WKSL'),

  // ---- Security policy ----
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(8),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  EMAIL_VERIFY_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(48),

  /// Emit `includeSubDomains` and `preload` on the HSTS header. Off by default
  /// because the app is served from a subdomain: a browser cannot preload a
  /// subdomain, and `includeSubDomains` there would only cover `*.that-host`
  /// while reading like a promise about the whole domain. Turn it on when the
  /// app really is the apex (or you want to force HTTPS on its own children).
  HSTS_INCLUDE_SUBDOMAINS: bool,

  /// Failed auth attempts per IP per window. The account test deliberately
  /// triggers three failures per run, so a local machine running it repeatedly
  /// exhausts a tight budget and every later run fails for the wrong reason.
  AUTH_LIMIT_MAX: z.coerce.number().int().min(3).max(1000).default(20),
  AUTH_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  // ---- Optional integrations ----
  ANALYTICS_ENDPOINT: z.string().optional(),
  ERROR_REPORT_ENDPOINT: z.string().optional(),
  SECURITY_ALERT_WEBHOOK: z.string().optional(),

  // ---- Google sign-in (optional) ----
  /// OAuth 2.0 credentials for a "Web application" client from Google Cloud
  /// Console. Unset (either one) means the feature is off: `/auth/providers`
  /// reports `google: false` and the client hides the button.
  GOOGLE_CLIENT_ID: blank,
  GOOGLE_CLIENT_SECRET: blank,
  /// Set only when the address Google redirects to is not the public one —
  /// for example a temporary tunnel or a port-forward. Defaults to
  /// `${PUBLIC_URL}/api/auth/google/callback`.
  GOOGLE_OAUTH_REDIRECT: blank,

  // ---- Background jobs ----
  ENABLE_JOBS: bool,
  JOB_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),

  // ---- Web push (optional) ----
  /// VAPID credentials for Web Push. Unset (either one) means the feature is
  /// off: `/api/push/public-key` reports `enabled: false` and the client hides
  /// the toggle. Generate with `npx web-push generate-vapid-keys`.
  VAPID_PUBLIC_KEY: blank,
  VAPID_PRIVATE_KEY: blank,
  /// `mailto:` address or `https://` URL the push services may use to contact
  /// the app operator. Required by the VAPID spec when sending.
  VAPID_SUBJECT: blank,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('\n[config] Invalid environment variables:\n');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  // eslint-disable-next-line no-console
  console.error('\nCopy server/.env.example to server/.env and fill in the values.\n');
  process.exit(1);
}

const raw = parsed.data;
// Paths are always anchored to the package root, never to the working
// directory, so uploads land in the same place regardless of how we were started.
const serverRoot = packageRoot;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isDev: raw.NODE_ENV === 'development',
  clientOrigins: raw.CLIENT_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  uploadDir: path.isAbsolute(raw.UPLOAD_DIR) ? raw.UPLOAD_DIR : path.join(serverRoot, raw.UPLOAD_DIR),
  serverRoot,
  /** True when an actual SMTP transport is configured. */
  smtpEnabled: Boolean(raw.SMTP_HOST && raw.SMTP_PORT),
  /**
   * True when both VAPID keys are present. Subject falls back to the public
   * URL — VAPID wants an operator contact, and a `mailto:` is the one form
   * that is always valid.
   */
  webPushEnabled: Boolean(raw.VAPID_PUBLIC_KEY && raw.VAPID_PRIVATE_KEY),
  vapidSubject: raw.VAPID_SUBJECT || operatorContact(raw.PUBLIC_URL),
} as const;

/** `mailto:` from the public host, falling back when the URL cannot be parsed. */
function operatorContact(publicUrl: string): string {
  try {
    return `mailto:admin@${new URL(publicUrl).host}`;
  } catch {
    return 'mailto:admin@localhost';
  }
}

export function ensureUploadDir(): string {
  if (!fs.existsSync(env.uploadDir)) {
    fs.mkdirSync(env.uploadDir, { recursive: true });
  }
  return env.uploadDir;
}
