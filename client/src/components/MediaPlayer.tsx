import { Download, Film, Music } from 'lucide-react';

import type { Attachment } from '../types';

interface MediaPlayerProps {
  attachment: Attachment;
  postSlug: string;
}

/**
 * MediaPlayer — แสดงเครื่องเล่นวิดีโอหรือเสียงสำหรับไฟล์แนบ
 * เฉพาะไฟล์ที่ระบบอนุญาตให้แสดง inline (video / audio) เท่านั้น
 */
export function MediaPlayer({ attachment, postSlug }: MediaPlayerProps) {
  const isVideo = attachment.mimeType.startsWith('video/');
  const isAudio = attachment.mimeType.startsWith('audio/');
  const url = `/api/posts/${postSlug}/attachments/${attachment.id}`;
  const sizeMB = (attachment.size / 1024 / 1024).toFixed(2);

  if (!isVideo && !isAudio) return null;

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

      {isVideo ? (
        <video
          src={url}
          controls
          className="w-full max-w-full rounded-lg border border-ink-500/15 bg-black"
          preload="metadata"
          poster=""
        />
      ) : (
        <audio
          src={url}
          controls
          className="w-full"
          preload="metadata"
        />
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-ink-500">
        <span>{sizeMB} MB</span>
        <a
          href={url}
          download
          className="flex items-center gap-1 text-brand-400 hover:underline hover:underline-offset-4"
        >
          <Download size={14} /> ดาวน์โหลด
        </a>
      </div>
    </div>
  );
}
