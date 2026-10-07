/**
 * Structured JSON logger.
 *
 * In production every line is a single JSON object so it can be shipped
 * straight into Loki/CloudWatch/Datadog without a parser. In development we
 * pretty-print with colours and drop the timestamp noise.
 */
import { env } from './env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = env.LOG_LEVEL;

const COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

export interface LogFields {
  [key: string]: unknown;
}

/** Values that should never reach the log sink. */
const REDACT_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
]);

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = REDACT_KEYS.has(key) ? '[redacted]' : value;
  }
  return out;
}

function formatValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function emit(level: Level, message: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const safeFields = redact(fields);

  if (env.isProd) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level,
        time: new Date().toISOString(),
        msg: message,
        ...safeFields,
      }),
    );
    return;
  }

  const parts = Object.entries(safeFields).map(([k, v]) => `${k}=${formatValue(v)}`);
  // eslint-disable-next-line no-console
  console.log(
    `${COLORS[level]}${new Date().toTimeString().slice(0, 8)} ${level.toUpperCase().padEnd(5)}${RESET} ${message}${
      parts.length ? ` \x1b[90m${parts.join(' ')}${RESET}` : ''
    }`,
  );
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
  child(bindings: LogFields) {
    return {
      debug: (msg: string, fields?: LogFields) => emit('debug', msg, { ...bindings, ...fields }),
      info: (msg: string, fields?: LogFields) => emit('info', msg, { ...bindings, ...fields }),
      warn: (msg: string, fields?: LogFields) => emit('warn', msg, { ...bindings, ...fields }),
      error: (msg: string, fields?: LogFields) => emit('error', msg, { ...bindings, ...fields }),
    };
  },
};

export type Logger = typeof logger;