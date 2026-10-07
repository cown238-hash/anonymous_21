import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { createSocketServer } from './realtime/index.js';
import { startScheduler, stopScheduler } from './services/jobs.js';

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server);

// Give in-flight requests time to finish before the process exits.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
// Slowloris protection.
server.requestTimeout = 30_000;

let shuttingDown = false;

async function main() {
  try {
    await prisma.$connect();
    logger.info('database connected');
  } catch (err) {
    logger.error('database connection failed', {
      error: err instanceof Error ? err.message : String(err),
      hint: 'ตรวจสอบว่า PostgreSQL ทำงานอยู่ และ DATABASE_URL ใน server/.env ถูกต้อง',
    });
    process.exit(1);
  }

  startScheduler();

  server.listen(env.PORT, () => {
    logger.info('server listening', {
      url: `http://localhost:${env.PORT}`,
      client: env.PUBLIC_URL,
      env: env.NODE_ENV,
      smtp: env.smtpEnabled,
      jobs: env.ENABLE_JOBS,
    });
    logger.info('');
    logger.info(`  Web      →  ${env.PUBLIC_URL}`);
    logger.info(`  API      →  http://localhost:${env.PORT}/api`);
    logger.info(`  Health   →  http://localhost:${env.PORT}/api/health`);
    logger.info(`  Ready    →  http://localhost:${env.PORT}/api/ready`);
    logger.info(`  Metrics  →  http://localhost:${env.PORT}/api/metrics`);
    logger.info(`  SocketIO →  ws://localhost:${env.PORT}/socket.io`);
    logger.info('');
  });
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutdown requested', { signal });

  const force = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 15_000);
  force.unref();

  try {
    stopScheduler();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    logger.info('shutdown complete');
    clearTimeout(force);
    process.exit(0);
  } catch (err) {
    logger.error('error during shutdown', { error: String(err) });
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', { error: reason instanceof Error ? reason.stack : String(reason) });
});

process.on('uncaughtException', (err) => {
  // An uncaught exception leaves the process in an unknown state; log it and
  // let the supervisor restart us cleanly.
  logger.error('uncaught exception', { error: err.stack ?? err.message });
  void shutdown('uncaughtException');
});

void main();