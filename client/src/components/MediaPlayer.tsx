import { useState } from 'react';
import { Download, Film, Music } from 'lucide-react';
import type { Attachment } from '../types';

interface MediaPlayerProps {
  attachment: Attachment;
  postSlug: string;
}

/**
 * MediaPlayer — แสดงเครื่องเล่นวิดีโอหรือเสียงสำหรับไฟล์แนบ
 * ใช้ URL ที่เซิร์ฟเวอร์ส่งมาให้ (attachment.url) และรองรับ Range request
 * สำหรับการ seek วิดีโอ
 */
export function MediaPlayer({ attachment, postSlug }: MediaPlayerProps) {
  const isVideo = attachment.mimeType.startsWith('video/');
  const isAudio = attachment.mimeType.startsWith('audio/');

  // ใช้ URL ที่เซิร์ฟเวอร์กำหนดไว้แล้ว (ตรงกับ route GET /api/posts/:slug/attachments/:id)
  const url = attachment.url ?? `/api/posts/${postSlug}/attachments/${attachment.id}`;
  const downloadUrl = attachment.downloadUrl ?? `${url}?download=1`;
  const sizeMB = (attachment.size / 1024 / 1024).toFixed(2);
  const [error, setError] = useState<string | null>(null);

  if (!isVideo && !isAudio) return null;

  const handleError = () => {
    setError('ไม่สามารถโหลดสื่อนี้ได้ อาจเป็นเพราะไฟล์ถูกลบ หรือเบราว์เซอร์ไม่รองรับไฟล์ชนิดนี้');
  };

  return (
    <div className="card p-4 mt-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isVideo ? (
            <Film size={20} className="text-brand-400" />
          ) : (
            <Music size={20} className="text-brand-400" />
          )}
          <span className="font-medium text-ink-900 truncate max-w-[200px]">
            {attachment.name}
          </span>
        </div>
        <span className="text-xs text-ink-500">{attachment.mimeType}</span>
      </div>

      {error ? (
        <div className="rounded-xl border border-ink-500/15 bg-surface-2 p-4 text-center">
          <p className="text-sm text-ink-500">{error}</p>
          <a
            href={downloadUrl}
            download
            className="mt-2 inline-flex items-center gap-1 text-brand-400 text-sm hover:underline"
          >
            <Download size={14} /> ดาวน์โหลดไฟล์แทน
          </a>
        </div>
      ) : (
        <>
          {isVideo ? (
            <video
              src={url}
              controls
              playsInline
              className="w-full max-w-full rounded-lg border border-ink-500/15 bg-black"
              preload="metadata"
              onError={handleError}
            />
          ) : (
            <audio
              src={url}
              controls
              className="w-full"
              preload="metadata"
              onError={handleError}
            />
          )}

          <div className="mt-3 flex items-center gap-3 text-xs text-ink-500">
            <span>{sizeMB} MB</span>
            <a
              href={downloadUrl}
              download
              className="flex items-center gap-1 text-brand-400 hover:underline hover:underline-offset-4"
            >
              <Download size={14} /> ดาวน์โหลด
            </a>
          </div>
        </>
      )}
    </div>
  );
}
