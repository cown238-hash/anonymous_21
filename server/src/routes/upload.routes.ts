import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { created, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rate-limit.js';
import { filesUploader, imageUploader, removeUploadByFilename } from '../middleware/upload.js';
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

export default router;
