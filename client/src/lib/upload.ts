import { api } from './api';

/**
 * Attachment uploads for post attachments.
 *
 * Files up to the normal cap go out as one multipart request. Anything bigger
 * is uploaded as many small chunks (see server/src/services/chunked-upload.ts)
 * which the server reassembles — that is what makes files of ~1 GB possible
 * without any proxy in front of the app ever seeing a huge request body.
 */

export interface UploadedAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

interface InitResponse {
  uploadId: string;
  chunkSizeMb: number;
  maxFileMb: number;
}

interface CompleteResponse {
  file: UploadedAttachment;
}

const MAX_CHUNK_RETRIES = 3;

/**
 * Uploads one file and resolves to the attachment record the server created.
 * `onProgress` receives a 0..1 fraction (per-chunk granularity on big files).
 */
export async function uploadAttachment(
  file: File,
  options: {
    /** Max size the regular endpoint accepts; bigger files switch to chunks. */
    normalLimitMb?: number;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<UploadedAttachment> {
  const normalLimitMb = options.normalLimitMb ?? 100;

  if (file.size <= normalLimitMb * 1024 * 1024) {
    const fd = new FormData();
    fd.append('files', file);
    const result = await api.upload<{ files: UploadedAttachment[] }>('/uploads/files', fd);
    options.onProgress?.(1);
    return result.files[0];
  }

  const init = await api.post<InitResponse>('/uploads/chunks/init');
  const chunkSize = init.chunkSizeMb * 1024 * 1024;
  const total = Math.ceil(file.size / chunkSize);

  if (total > 10_000) {
    throw new Error('ไฟล์ใหญ่เกินขีดจำกัด (1 GB)');
  }

  let uploadedBytes = 0;
  for (let index = 0; index < total; index++) {
    const start = index * chunkSize;
    const blob = file.slice(start, Math.min(start + chunkSize, file.size));

    const fd = new FormData();
    fd.append('uploadId', init.uploadId);
    fd.append('index', String(index));
    fd.append('total', String(total));
    fd.append('size', String(file.size));
    fd.append('filename', file.name);
    fd.append('mimeType', file.type || 'application/octet-stream');
    fd.append('chunk', blob, 'chunk.bin');

    let lastError: unknown;
    let sent = false;
    for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt++) {
      try {
        await api.upload('/uploads/chunks', fd);
        sent = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_CHUNK_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
    if (!sent) {
      throw lastError instanceof Error
        ? lastError
        : new Error('อัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }

    uploadedBytes += blob.size;
    options.onProgress?.(uploadedBytes / file.size);
  }

  const done = await api.post<CompleteResponse>(`/uploads/chunks/${init.uploadId}/complete`);
  options.onProgress?.(1);
  return done.file;
}
