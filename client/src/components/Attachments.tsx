import { useState } from 'react';
import clsx from 'clsx';
import {
  Archive,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileType2,
  Image as ImageIcon,
  Loader2,
  Music4,
  Paperclip,
  Play,
  Presentation,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import type { Attachment } from '../types';
import { fileKindOf, formatBytes, FILE_KIND_LABEL, type FileKind } from '../lib/format';

/** One icon per file bucket, so a wall of files stays scannable. */
const KIND_ICON: Record<FileKind, typeof FileText> = {
  image: ImageIcon,
  pdf: FileText,
  doc: FileType2,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: Archive,
  text: FileText,
  code: FileCode,
  media: Play,
  font: Type,
  other: Paperclip,
};

/**
 * Kept in step with the server allow list in `middleware/upload.ts` — if the
 * picker hides a type the API would accept, the user is stuck at the dialog.
 */
const MIME_ATTR = [
  // images and documents
  'image/*',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp', '.rtf', '.epub',
  // text and data
  '.txt', '.md', '.csv', '.tsv', '.log', '.ini', '.json', '.xml', '.yaml', '.yml', '.html', '.htm',
  // archives
  '.zip', '.gz', '.tgz', '.tar', '.7z', '.rar',
  // audio and video
  '.mp3', '.ogg', '.wav', '.flac', '.m4a', '.mp4', '.mov', '.webm', '.mkv', '.avi',
  // code
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.h',
  '.cpp', '.hpp', '.cs', '.php', '.sh', '.bash', '.sql', '.swift', '.kt', '.vue', '.svelte',
  // fonts
  '.woff', '.woff2', '.ttf', '.otf',
].join(',');

interface AttachmentPickerProps {
  /** Files already saved on the post. */
  attachments: Attachment[];
  /** Files uploaded in this session but not yet linked. */
  pending: PendingUpload[];
  onAdd: (files: File[]) => void;
  onRemoveSaved: (id: string) => void;
  onDiscardPending: (localId: string) => void;
  /** Hard cap, mirroring the server limit. */
  max: number;
  /** Bytes each file may be, mirroring the server limit. */
  maxMb: number;
  disabled?: boolean;
}

/** An upload that has reached the server but is not yet attached to a post. */
export interface PendingUpload {
  localId: string;
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export function AttachmentPicker({
  attachments,
  pending,
  onAdd,
  onRemoveSaved,
  onDiscardPending,
  max,
  maxMb,
  disabled,
}: AttachmentPickerProps) {
  const [dragging, setDragging] = useState(false);
  const total = attachments.length + pending.length;
  const full = total >= max;

  const accept = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onAdd(Array.from(list));
  };

  return (
    <div>
      {/* ---------- Drop zone ---------- */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!full && !disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!full && !disabled) accept(e.dataTransfer.files);
        }}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-7 text-center transition',
          full || disabled
            ? 'cursor-not-allowed border-ink-500/12 opacity-50'
            : dragging
              ? 'border-brand-500 bg-brand-500/8'
              : 'border-ink-500/20 hover:border-brand-500/50 hover:bg-surface-2',
        )}
      >
        <input
          type="file"
          multiple
          accept={MIME_ATTR}
          className="sr-only"
          disabled={full || disabled}
          onChange={(e) => {
            accept(e.target.files);
            // Reset so re-picking the same file still fires a change event.
            e.target.value = '';
          }}
        />
        <Upload size={20} className="text-brand-400" />
        <p className="mt-3 text-sm font-medium text-ink-900">
          {full ? `ครบ ${max} ไฟล์แล้ว` : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}
        </p>
        <p className="mt-1 text-xs text-ink-400">
          เอกสาร รูปภาพ ซิป วิดีโอ ซอร์สโค้ด · ไม่เกิน {maxMb} MB ต่อไฟล์ · เหลือ {max - total} ช่อง
        </p>
      </label>

      {/* ---------- File list ---------- */}
      {(attachments.length > 0 || pending.length > 0) && (
        <ul className="mt-4 space-y-2">
          {attachments.map((file) => (
            <AttachmentRow
              key={file.id}
              name={file.name}
              mimeType={file.mimeType}
              size={file.size}
              onRemove={disabled ? undefined : () => onRemoveSaved(file.id)}
              removeLabel="นำไฟล์นี้ออกจากบทความ"
            />
          ))}
          {pending.map((file) => (
            <AttachmentRow
              key={file.localId}
              name={file.name}
              mimeType={file.mimeType}
              size={file.size}
              pending
              onRemove={disabled ? undefined : () => onDiscardPending(file.localId)}
              removeLabel="ยกเลิกไฟล์นี้"
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentRow({
  name,
  mimeType,
  size,
  pending,
  onRemove,
  removeLabel,
}: {
  name: string;
  mimeType: string;
  size: number;
  pending?: boolean;
  onRemove?: () => void;
  removeLabel: string;
}) {
  const kind = fileKindOf(name, mimeType);
  const Icon = KIND_ICON[kind];
  const isMedia = kind === 'media';

  return (
    <li className="flex items-center gap-3 rounded-xl border border-ink-500/12 bg-surface-1 px-3 py-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-brand-400">
        {isMedia ? <Music4 size={16} /> : <Icon size={16} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{name}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
          {FILE_KIND_LABEL[kind]}
          <span aria-hidden>·</span>
          {formatBytes(size)}
          {pending && (
            <>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1 text-brand-400">
                <Loader2 size={11} className="animate-spin" />
                กำลังแนบ
              </span>
            </>
          )}
        </span>
      </span>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="btn-ghost h-7 w-7 shrink-0 p-0 hover:text-danger"
          title={removeLabel}
          aria-label={`${removeLabel}: ${name}`}
        >
          {pending ? <X size={14} /> : <Trash2 size={14} />}
        </button>
      )}
    </li>
  );
}

/** Read-only list shown on a published post. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Paperclip size={15} className="text-brand-400" />
        <h2 className="text-sm font-semibold tracking-tight text-ink-900">
          ไฟล์แนบ
        </h2>
        <span className="badge bg-surface-2 text-ink-400">{attachments.length}</span>
      </div>

      <ul className="space-y-2">
        {attachments.map((file) => {
          const kind = fileKindOf(file.name, file.mimeType);
          const Icon = KIND_ICON[kind];
          return (
            <li key={file.id}>
              <a
                href={file.downloadUrl}
                className="group flex items-center gap-3 rounded-xl border border-ink-500/12 bg-surface-1 px-3 py-2.5 transition hover:border-brand-500/40 hover:bg-surface-2"
                download
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-brand-400 transition group-hover:bg-brand-500/10">
                  {kind === 'media' ? <Music4 size={16} /> : <Icon size={16} />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">{file.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
                    {FILE_KIND_LABEL[kind]}
                    <span aria-hidden>·</span>
                    {formatBytes(file.size)}
                  </span>
                </span>

                <Download
                  size={15}
                  className="shrink-0 text-ink-400 transition group-hover:text-brand-400"
                />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Compact "n files" hint for feed cards. */
export function AttachmentBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-400"
      title={`มีไฟล์แนบ ${count} ไฟล์`}
    >
      <Paperclip size={13} />
      {count}
    </span>
  );
}
