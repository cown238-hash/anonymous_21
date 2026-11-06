import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { created, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { chunkUploadLimiter, uploadLimiter } from '../middleware/rate-limit.js';
import {
  filesUploader,
  imageUploader,
  removeUploadByFilename,
  assertAllowedFile,
} from '../middleware/upload.js';
import {
  abortChunkUpload,
  chunkStatus,
  completeChunkUpload,
  newUploadId,
  saveChunk,
} from '../services/chunked-upload.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

const router = Router();

/** POST /api/uploads/image - multipart field: `file`. Returns `{ url }`. */
router.post(
  '/image',
  requireAuth,
  uploadLimiter,
  imageUploader('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw HttpError.badRequest('ไม่พบไฟล์ที่อัปโหลด');

    const url = `/uploads/${file.filename}`;
    return created(res, {
      url,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimetype,
    });
  }),
);

/**
 * POST /api/uploads/files - multipart field: `files` (repeatable).
 *
 * Each file becomes an `Attachment` row with a null `postId`. The post create
 * and update endpoints claim these rows by id, which is why ownership is
 * recorded now: an upload can only ever be attached by the person who made it.
 * Rows that are never claimed are swept by the maintenance job.
 */
router.post(
  '/files',
  requireAuth,
  uploadLimiter,
  filesUploader('files'),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw HttpError.badRequest('ไม่พบไฟล์ที่อัปโหลด');

    const userId = req.user!.id;

    try {
      const rows = await prisma.$transaction(
        files.map((file) =>
          prisma.attachment.create({
            data: {
              uploadedById: userId,
              filename: file.filename,
              // Keep the name the browser sent, minus any directory component a
              // crafted request may have included.
              originalName: path.basename(file.originalname).slice(0, 200),
              mimeType: file.mimetype,
              size: file.size,
            },
          }),
        ),
      );

      return created(res, {
        files: rows.map((row) => ({
          id: row.id,
          filename: row.filename,
          originalName: row.originalName,
          mimeType: row.mimeType,
          size: row.size,
        })),
      });
    } catch (err) {
      // Never leave bytes on disk that no row points at.
      for (const file of files) fs.promises.unlink(path.join(env.uploadDir, file.filename)).catch(() => undefined);
      throw err;
    }
  }),
);

/** GET /api/uploads - the caller's own uploads. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const files = await fs.promises.readdir(env.uploadDir).catch(() => [] as string[]);
    const items = await Promise.all(
      files
        .filter((f) => !f.startsWith('.'))
        .map(async (filename) => {
          const stat = await fs.promises.stat(path.join(env.uploadDir, filename)).catch(() => null);
          return {
            url: `/uploads/${filename}`,
            filename,
            size: stat?.size ?? 0,
            uploadedAt: stat?.mtime.toISOString() ?? null,
          };
        }),
    );
    items.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
    return ok(res, items);
  }),
);

/**
 * DELETE /api/uploads/files/:id - discard an attachment the caller uploaded but
 * has not yet attached to a post.
 */
router.delete(
  '/files/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) throw HttpError.notFound('ไม่พบไฟล์ที่ต้องการลบ');
    if (attachment.uploadedById !== req.user!.id) throw HttpError.forbidden();
    if (attachment.postId) {
      throw HttpError.badRequest('ไฟล์นี้ถูกแนบกับบทความแล้ว — ใช้การลบไฟล์แนบของบทความแทน');
    }

    await prisma.attachment.delete({ where: { id: attachment.id } });
    removeUploadByFilename(attachment.filename);
    return ok(res, { id: attachment.id });
  }),
);

/** In-memory chunk buffer — chunks are capped at UPLOAD_CHUNK_MB, so this is small. */
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_CHUNK_MB * 1024 * 1024, files: 1 },
});

const chunkMetaSchema = z.object({
  uploadId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'uploadId ไม่ถูกต้อง'),
  index: z.coerce.number().int().min(0),
  total: z.coerce.number().int().min(1).max(10_000),
  size: z.coerce.number().int().positive(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100).default('application/octet-stream'),
});

/**
 * POST /api/uploads/chunks - one piece of a big file.
 *
 * The client splits files bigger than the small-request cap into chunks of
 * UPLOAD_CHUNK_MB and uploads them here in any order (retry-safe). Once every
 * chunk has landed, POST .../complete reassembles and registers the file.
 */
router.post(
  '/chunks',
  requireAuth,
  chunkUploadLimiter,
  chunkUpload.single('chunk'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw HttpError.badRequest('ไม่พบชิ้นไฟล์ที่อัปโหลด');

    const parsed = chunkMetaSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('ข้อมูลการอัปโหลดไม่ถูกต้อง', parsed.error.issues);
    }
    const { uploadId, index, total, size, filename, mimeType } = parsed.data;

    // Honour the same allow-list as the regular upload path.
    assertAllowedFile(mimeType, filename);

    const result = await saveChunk({
      uploadId,
      userId: req.user!.id,
      index,
      total,
      size,
      originalName: filename,
      mimeType,
      bytes: file.buffer,
    });
    return ok(res, { ...result, chunkBytes: file.buffer.length });
  }),
);

/** GET /api/uploads/chunks/:uploadId - which pieces the server already holds. */
router.get(
  '/chunks/:uploadId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await chunkStatus(req.params.uploadId, req.user!.id);
    if (!status) return ok(res, { received: [], total: 0, size: 0, missing: true });
    return ok(res, { ...status, missing: false });
  }),
);

/**
 * POST /api/uploads/chunks/:uploadId/complete - reassemble and register the
 * file as an `Attachment` row, identical in shape to POST /uploads/files.
 */
router.post(
  '/chunks/:uploadId/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await completeChunkUpload(req.params.uploadId, req.user!.id);
    try {
      const row = await prisma.attachment.create({
        data: {
          uploadedById: req.user!.id,
          filename: result.filename,
          originalName: path.basename(result.originalName).slice(0, 200),
          mimeType: result.mimeType,
          size: result.size,
        },
      });
      return created(res, {
        file: {
          id: row.id,
          filename: row.filename,
          originalName: row.originalName,
          mimeType: row.mimeType,
          size: row.size,
        },
      });
    } catch (err) {
      // Never leave the assembled bytes behind without an owning row.
      await fs.promises
        .unlink(path.join(env.uploadDir, path.basename(result.filename)))
        .catch(() => undefined);
      throw err;
    }
  }),
);

/** DELETE /api/uploads/chunks/:uploadId - give up and discard all chunks. */
router.delete(
  '/chunks/:uploadId',
  requireAuth,
  asyncHandler(async (req, res) => {
    await abortChunkUpload(req.params.uploadId, req.user!.id);
    return ok(res, { aborted: true });
  }),
);

/** POST /api/uploads/chunks/init - reserve a fresh uploadId for the client. */
router.post(
  '/chunks/init',
  requireAuth,
  asyncHandler(async (_req, res) => {
    return created(res, {
      uploadId: newUploadId(),
      chunkSizeMb: env.UPLOAD_CHUNK_MB,
      maxFileMb: env.MAX_CHUNKED_UPLOAD_MB,
    });
  }),
);

export default router;
