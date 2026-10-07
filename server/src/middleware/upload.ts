import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { env, ensureUploadDir } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

/**
 * Cover images and avatars are rendered inside the page, so this list stays
 * small and excludes anything that can carry script (SVG) or a declared type
 * that disagrees with the bytes (HTML).
 */
const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

/**
 * Post attachments cover a much wider range, but still an explicit allow list:
 * an unknown type is rejected rather than stored and served to other users.
 */
const FILE_MIME = new Set([
  // documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'application/epub+zip',
  // text and data
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'application/xml',
  'text/xml',
  'application/yaml',
  'text/yaml',
  // archives
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  // audio and video
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/flac',
  'audio/x-m4a',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  // code
  'text/javascript',
  'application/javascript',
  'text/x-python',
  'text/x-ruby',
  'text/x-java',
  'text/x-c',
  'text/x-c++',
  'text/x-csharp',
  'text/x-go',
  'text/x-rust',
  'text/x-php',
  'text/x-sql',
  'text/x-sh',
  'text/x-swift',
  'text/x-kotlin',
  // fonts
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/font-woff',
]);

/** Everything an attachment may be, as one set — used by the extension check. */
const FILE_EXT = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp', '.rtf', '.epub',
  '.txt', '.md', '.csv', '.tsv', '.log', '.ini', '.html', '.htm', '.json', '.xml', '.yaml', '.yml',
  '.zip', '.gz', '.tgz', '.tar', '.7z', '.rar',
  '.mp3', '.ogg', '.wav', '.flac', '.m4a', '.mp4', '.mov', '.webm', '.mkv', '.avi',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.sql', '.sh', '.bash', '.swift', '.kt',
  '.vue', '.svelte',
  '.woff', '.woff2', '.ttf', '.otf',
]);

/** Extensions we are willing to serve inline; everything else is a download. */
export const INLINE_SAFE_EXT = new Set([...IMAGE_EXT]);

/**
 * Types that are safe to hand back to a browser as an attachment. Text-like
 * types are excluded because a browser may render them despite the
 * `Content-Disposition: attachment` header being ignored by some clients.
 */
export function isSafeInline(mimeType: string): boolean {
  return IMAGE_MIME.has(mimeType);
}

export function assertAllowedFile(mimetype: string, originalname: string): void {
  const ext = path.extname(originalname).toLowerCase();
  if (!FILE_MIME.has(mimetype)) {
    throw HttpError.badRequest(`ไม่รองรับไฟล์ชนิดนี้ (${mimetype})`);
  }
  // Both the declared type and the extension must be on the list, so a renamed
  // executable cannot slip through on a permissive type.
  if (!FILE_EXT.has(ext)) {
    throw HttpError.badRequest(`ไม่รองรับนามสกุลไฟล์นี้ (${ext || 'ไม่มีนามสกุล'})`);
  }
}

ensureUploadDir();

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, ensureUploadDir());
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = IMAGE_EXT.has(ext) || FILE_EXT.has(ext) ? ext : '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  },
});

const uploadImage = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!IMAGE_MIME.has(file.mimetype)) {
      return cb(HttpError.badRequest(`ไม่รองรับไฟล์ชนิดนี้ (${file.mimetype})`));
    }
    cb(null, true);
  },
});

const uploadFiles = multer({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: env.MAX_FILES_PER_UPLOAD,
  },
  fileFilter(_req, file, cb) {
    try {
      assertAllowedFile(file.mimetype, file.originalname);
      cb(null, true);
    } catch (err) {
      cb(err as Error);
    }
  },
});

/** Wraps multer so its errors become friendly HttpError instances. */
function wrapMulter(handler: (req: Request, res: Response, next: (err?: unknown) => void) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(HttpError.payloadTooLarge(`ไฟล์ใหญ่เกิน ${env.MAX_UPLOAD_MB} MB`));
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(HttpError.badRequest(`อัปโหลดได้สูงสุด ${env.MAX_FILES_PER_UPLOAD} ไฟล์ต่อครั้ง`));
        }
        return next(HttpError.badRequest(`อัปโหลดไม่สำเร็จ: ${err.message}`));
      }
      next(err);
    });
  };
}

/** Single image, for covers and avatars. */
export function imageUploader(field: string) {
  return wrapMulter(uploadImage.single(field));
}

/** Many files at once, for post attachments. */
export function filesUploader(field: string) {
  return wrapMulter(uploadFiles.array(field, env.MAX_FILES_PER_UPLOAD));
}

export function removeUpload(relativeUrl: string | null | undefined): void {
  if (!relativeUrl || !relativeUrl.startsWith('/uploads/')) return;
  removeUploadByFilename(path.basename(relativeUrl));
}

/** Deletes a stored file by its on-disk name. Path traversal is impossible
 *  because `path.basename` strips any directory component first. */
export function removeUploadByFilename(filename: string): void {
  const safeName = path.basename(filename);
  const target = path.join(env.uploadDir, safeName);
  if (path.dirname(target) !== env.uploadDir) return;
  fs.promises.unlink(target).catch(() => undefined);
}
