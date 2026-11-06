import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { removeUploadByFilename } from '../middleware/upload.js';

/**
 * Periodic maintenance, run in-process by default and also exposed as
 * `npm run jobs` so it can be driven by an external scheduler (cron / k8s
 * CronJob) instead of living inside the web server.
 */

async function pruneExpiredSessions() {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { sessions: count };
}

async function pruneExpiredTokens() {
  const now = new Date();
  const [reset, verification] = await Promise.all([
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { resetTokens: reset.count, verificationTokens: verification.count };
}

async function pruneReadNotifications() {
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.notification.deleteMany({
    where: { readAt: { not: null }, createdAt: { lt: cutoff } },
  });
  return { notifications: count };
}

async function purgeDeletedAccounts() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.user.deleteMany({
    where: { deletedAt: { not: null, lt: cutoff } },
  });
  return { purgedAccounts: count };
}

async function unlockExpiredAccounts() {
  const { count } = await prisma.user.updateMany({
    where: { lockedUntil: { lte: new Date() } },
    data: { lockedUntil: null, failedLoginCount: 0 },
  });
  return { unlockedAccounts: count };
}

/** Deletes uploads that are no longer referenced by any user, post, or attachment. */
async function pruneOrphanUploads() {
  if (!fs.existsSync(env.uploadDir)) return { files: 0 };

  const [avatars, covers, attachments] = await Promise.all([
    prisma.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
    prisma.post.findMany({ where: { coverImage: { not: null } }, select: { coverImage: true } }),
    prisma.attachment.findMany({ select: { filename: true } }),
  ]);

  const referenced = new Set<string>();
  for (const row of avatars) {
    if (row.avatarUrl?.startsWith('/uploads/')) referenced.add(path.basename(row.avatarUrl));
  }
  for (const row of covers) {
    if (row.coverImage?.startsWith('/uploads/')) referenced.add(path.basename(row.coverImage));
  }
  for (const row of attachments) referenced.add(row.filename);

  let removed = 0;
  const files = await fs.promises.readdir(env.uploadDir).catch(() => [] as string[]);
  for (const filename of files) {
    if (filename.startsWith('.') || referenced.has(filename)) continue;
    // Only remove files older than a day so a just-uploaded image that has not
    // been attached to anything yet is not swept away mid-request.
    const stat = await fs.promises.stat(path.join(env.uploadDir, filename)).catch(() => null);
    if (!stat) continue;
    if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) continue;
    await fs.promises.unlink(path.join(env.uploadDir, filename)).catch(() => undefined);
    removed++;
  }
  return { files: removed };
}

/**
 * Removes `Attachment` rows that were uploaded but never claimed by a post —
 * the author changed their mind, or the save failed. Their bytes go with them.
 */
async function pruneUnclaimedAttachments() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stale = await prisma.attachment.findMany({
    where: { postId: null, createdAt: { lt: cutoff } },
    select: { id: true, filename: true },
  });
  if (stale.length === 0) return { attachments: 0 };

  await prisma.attachment.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
  for (const row of stale) removeUploadByFilename(row.filename);
  return { attachments: stale.length };
}

export async function runJobs(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const tasks: Array<[string, () => Promise<Record<string, unknown>>]> = [
    ['sessions', pruneExpiredSessions],
    ['tokens', pruneExpiredTokens],
    ['notifications', pruneReadNotifications],
    ['accounts', unlockExpiredAccounts],
    ['uploads', pruneOrphanUploads],
    ['unclaimedAttachments', pruneUnclaimedAttachments],
    ['deletedAccounts', purgeDeletedAccounts],
  ];

  const results: Record<string, unknown> = {};
  for (const [name, task] of tasks) {
    try {
      results[name] = await task();
    } catch (err) {
      logger.error('job failed', { job: name, error: err instanceof Error ? err.message : String(err) });
      results[name] = { error: String(err) };
    }
  }

  logger.info('maintenance jobs finished', { durationMs: Date.now() - started, results });
  return results;
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (!env.ENABLE_JOBS) {
    logger.info('scheduler disabled (ENABLE_JOBS=false)');
    return;
  }

  const intervalMs = env.JOB_INTERVAL_MINUTES * 60 * 1000;
  // Run once shortly after boot so a fresh deploy cleans up immediately.
  setTimeout(() => void runJobs(), 30_000).unref();
  timer = setInterval(() => void runJobs(), intervalMs);
  timer.unref();

  logger.info('scheduler started', { intervalMinutes: env.JOB_INTERVAL_MINUTES });
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}