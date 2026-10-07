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

for (const candidate of [
  path.join(packageRoot, '.env'),
  path.resolve(process.cwd(), 'server', '.env'),
  path.resolve(process.cwd(), '.env'),
]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

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

  TRUST_PROXY: bool,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ---- Email (SMTP). Unset -> emails are written to the log instead. ----
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('WKSL <no-reply@nimbus.local>'),

  // ---- Feature toggles ----
  EMAIL_VERIFICATION_REQUIRED: bool,
  TWO_FACTOR_ISSUER: z.string().default('WKSL'),

  // ---- Security policy ----
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(8),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  EMAIL_VERIFY_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(48),

  /// Failed auth attempts per IP per window. The account test deliberately
  /// triggers three failures per run, so a local machine running it repeatedly
  /// exhausts a tight budget and every later run fails for the wrong reason.
  AUTH_LIMIT_MAX: z.coerce.number().int().min(3).max(1000).default(20),
  AUTH_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  // ---- Optional integrations ----
  ANALYTICS_ENDPOINT: z.string().optional(),
  ERROR_REPORT_ENDPOINT: z.string().optional(),
  SECURITY_ALERT_WEBHOOK: z.string().optional(),

  // ---- Background jobs ----
  ENABLE_JOBS: bool,
  JOB_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
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
} as const;

export function ensureUploadDir(): string {
  if (!fs.existsSync(env.uploadDir)) {
    fs.mkdirSync(env.uploadDir, { recursive: true });
  }
  return env.uploadDir;
}
