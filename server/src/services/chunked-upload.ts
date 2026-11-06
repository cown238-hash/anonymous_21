import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { env, ensureUploadDir } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

/**
 * Resumable large-file uploads ("chunked upload").
 *
 * A 1 GB video cannot travel as one request — the Cloudflare edge rejects
 * bodies above ~100 MB long before the app ever sees them. So big files are
 * sent as many small chunks (default 16 MB), each well under any proxy limit,
 * and reassembled here once every chunk has arrived. The final file is moved
 * into `uploads/` under a randomised name, exactly like the normal upload
 * path, and gets its own `Attachment` row.
 *
 * Chunks live in `uploads/.chunks/<uploadId>/` until completion (or until the
 * maintenance job sweeps stale sessions). This directory is never served.
 */

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export interface StoredChunkMeta {
  uploadId: string;
  userId: string;
  originalName: string;
  mimeType: string;
  /** Total bytes the client declared it will send. */
  size: number;
  /** Number of chunks the client declared. */
  total: number;
  /** Indices that have been fully written. */
  received: number[];
  createdAt: string;
}

export interface CompletedChunkUpload {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export function assertSafeUploadId(uploadId: string): void {
  if (!SAFE_ID.test(uploadId)) {
    throw HttpError.badRequest('uploadId ไม่ถูกต้อง');
  }
}

function chunksRoot(): string {
  return path.join(ensureUploadDir(), '.chunks');
}

function chunkDir(uploadId: string): string {
  return path.join(chunksRoot(), uploadId);
}

function metaPath(uploadId: string): string {
  return path.join(chunkDir(uploadId), 'meta.json');
}

function partPath(uploadId: string, index: number): string {
  return path.join(chunkDir(uploadId), `part-${String(index).padStart(5, '0')}`);
}

async function readMeta(uploadId: string): Promise<StoredChunkMeta | null> {
  try {
    const raw = await fs.promises.readFile(metaPath(uploadId), 'utf8');
    return JSON.parse(raw) as StoredChunkMeta;
  } catch {
    return null;
  }
}

async function writeMeta(meta: StoredChunkMeta): Promise<void> {
  await fs.promises.writeFile(metaPath(meta.uploadId), JSON.stringify(meta), 'utf8');
}

/** Short random suffix keeps the directory unguessable from the client side. */
function freshUploadId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function newUploadId(): string {
  return freshUploadId();
}

/**
 * Stores one chunk and returns the upload session's progress.
 *
 * Idempotent per index — re-sending the same chunk overwrites it, which is
 * what makes a flaky connection survivable without any client bookkeeping.
 */
export async function saveChunk(input: {
  uploadId: string;
  userId: string;
  index: number;
  total: number;
  size: number;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<{ received: number[]; total: number; size: number }> {
  const { uploadId, userId, index, total, size, originalName, mimeType, bytes } = input;
  assertSafeUploadId(uploadId);

  if (!Number.isInteger(total) || total < 1 || total > 10_000) {
    throw HttpError.badRequest('จำนวนชิ้นไม่ถูกต้อง');
  }
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    throw HttpError.badRequest('ลำดับชิ้นไม่ถูกต้อง');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw HttpError.badRequest('ขนาดไฟล์ไม่ถูกต้อง');
  }
  const maxBytes = env.MAX_CHUNKED_UPLOAD_MB * 1024 * 1024;
  if (size > maxBytes) {
    throw HttpError.payloadTooLarge(
      `ไฟล์ใหญ่เกิน ${env.MAX_CHUNKED_UPLOAD_MB} MB — ไม่สามารถอัปโหลดได้`,
    );
  }
  const chunkLimit = env.UPLOAD_CHUNK_MB * 1024 * 1024;
  if (bytes.length === 0 || bytes.length > chunkLimit) {
    throw HttpError.badRequest(`ชิ้นไฟล์ใหญ่เกิน ${env.UPLOAD_CHUNK_MB} MB`);
  }
  // A chunk may not exceed the declared remainder of the file either.
  const remaining = size - index * chunkLimit;
  if (bytes.length > Math.min(chunkLimit, Math.max(remaining, chunkLimit))) {
    // Only reject the impossible case where the declared total is inconsistent;
    // a slightly-off `size` must not deadlock the upload.
    if (index === total - 1 && remaining > 0 && bytes.length > remaining + chunkLimit) {
      throw HttpError.badRequest('ชิ้นไฟล์ใหญ่เกินส่วนที่เหลือของไฟล์');
    }
  }

  const dir = chunkDir(uploadId);
  await fs.promises.mkdir(dir, { recursive: true });

  let meta = await readMeta(uploadId);
  if (meta) {
    if (meta.userId !== userId) throw HttpError.forbidden();
    if (meta.total !== total || meta.size !== size) {
      throw HttpError.badRequest('ข้อมูลการอัปโหลดไม่ตรงกับเซสชันเดิม');
    }
  } else {
    meta = {
      uploadId,
      userId,
      originalName: path.basename(originalName).slice(0, 200),
      mimeType: mimeType || 'application/octet-stream',
      size,
      total,
      received: [],
      createdAt: new Date().toISOString(),
    };
  }

  await fs.promises.writeFile(partPath(uploadId, index), bytes);
  if (!meta.received.includes(index)) {
    meta.received = [...meta.received, index].sort((a, b) => a - b);
  }
  await writeMeta(meta);

  return { received: meta.received, total: meta.total, size: meta.size };
}

/** Which chunks the server already holds — drives resumable retries. */
export async function chunkStatus(
  uploadId: string,
  userId: string,
): Promise<{ received: number[]; total: number; size: number } | null> {
  assertSafeUploadId(uploadId);
  const meta = await readMeta(uploadId);
  if (!meta) return null;
  if (meta.userId !== userId) throw HttpError.forbidden();
  return { received: meta.received, total: meta.total, size: meta.size };
}

/**
 * Reassembles the chunks in order and creates nothing on its own — the caller
 * (the route) creates the `Attachment` row. The `.chunks` directory is removed.
 */
export async function completeChunkUpload(
  uploadId: string,
  userId: string,
): Promise<CompletedChunkUpload> {
  assertSafeUploadId(uploadId);
  const meta = await readMeta(uploadId);
  if (!meta) throw HttpError.notFound('ไม่พบเซสชันอัปโหลดนี้');
  if (meta.userId !== userId) throw HttpError.forbidden();
  if (meta.received.length !== meta.total) {
    throw HttpError.badRequest(`ยังอัปโหลดไม่ครบ (${meta.received.length}/${meta.total} ชิ้น)`);
  }

  const ext = path.extname(meta.originalName).toLowerCase() || '.bin';
  const finalName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const finalPath = path.join(ensureUploadDir(), finalName);

  try {
    // Copy part files one at a time (16 MB in memory each) instead of holding
    // streams open across the whole file — the whole point of chunking is that
    // peak memory stays flat no matter how big the final file is.
    const handle = await fs.promises.open(finalPath, 'w');
    try {
      for (let index = 0; index < meta.total; index++) {
        const data = await fs.promises.readFile(partPath(uploadId, index));
        await handle.write(data);
      }
    } finally {
      await handle.close();
    }

    const stat = await fs.promises.stat(finalPath);
    if (stat.size !== meta.size) {
      throw HttpError.badRequest(
        `ขนาดไฟล์ที่ประกอบได้ไม่ตรงกับที่ประกาศไว้ (${stat.size} != ${meta.size})`,
      );
    }

    return {
      filename: finalName,
      originalName: meta.originalName,
      mimeType: meta.mimeType,
      size: stat.size,
    };
  } finally {
    // The bytes now live in the final file (or the upload failed) — the chunk
    // directory is always disposable afterwards.
    await fs.promises.rm(chunkDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Aborts an upload session and discards everything stored for it. */
export async function abortChunkUpload(uploadId: string, userId: string): Promise<void> {
  assertSafeUploadId(uploadId);
  const meta = await readMeta(uploadId);
  if (!meta) return;
  if (meta.userId !== userId) throw HttpError.forbidden();
  await fs.promises.rm(chunkDir(uploadId), { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Maintenance: drop chunk sessions that went stale (client vanished mid-upload).
 * Bytes that never finished are never referenced by any row, so this is safe.
 */
export async function pruneStaleChunkUploads(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  const root = chunksRoot();
  let removed = 0;
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(
    () => [] as import('node:fs').Dirent[],
  );
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    let age = maxAgeMs + 1;
    const meta = await readMeta(entry.name);
    if (meta?.createdAt) {
      age = Date.now() - Date.parse(meta.createdAt);
    } else {
      const stat = await fs.promises.stat(dir).catch(() => null);
      age = stat ? Date.now() - stat.mtimeMs : 0;
    }
    if (age > maxAgeMs) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      removed++;
    }
  }
  return removed;
}
