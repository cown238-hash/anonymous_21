import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Copy,
  Download,
  File,
  Film,
  Loader2,
  Music,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../lib/api';
import { uploadAttachment } from '../lib/upload';
import { toast } from '../lib/toast';
import { SpinnerPage } from '../components/ui';
import { fileKindOf, formatBytes, FILE_KIND_LABEL } from '../lib/format';

/** Fallbacks until GET /api/config answers. */
const DEFAULT_MAX_FILES = 20;
const DEFAULT_MAX_CHUNKED_MB = 1024;

interface UploadCaps {
  maxUploadMb: number;
  maxFilesPerUpload: number;
  maxAttachmentsPerPost: number;
  maxChunkedUploadMb?: number;
  chunkUploadMb?: number;
}

interface StoredFile {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
  downloadUrl: string;
}

export function FileUploadPage() {
  const progressRef = useRef<Map<string, number>>(new Map());

  const { data: caps } = useQuery({
    queryKey: ['upload-caps'],
    queryFn: () => api.get<UploadCaps>('/config'),
    staleTime: 5 * 60_000,
  });
  const MAX_FILES = caps?.maxAttachmentsPerPost ?? DEFAULT_MAX_FILES;
  const MAX_CHUNKED_MB = caps?.maxChunkedUploadMb ?? DEFAULT_MAX_CHUNKED_MB;

  const [files, setFiles] = useState<StoredFile[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  /** Copy text to clipboard and toast. */
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`คัดลอก${label}แล้ว`);
    });
  };

  const discard = async (id: string) => {
    setPending((prev) => new Set(prev).add(id));
    try {
      await api.delete(`/uploads/files/${id}`);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      toast.success('ลบไฟล์แล้ว');
    } catch {
      // Not a big deal — the maintenance job sweeps unclaimed files after a day.
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const room = MAX_FILES - files.length;
    if (room <= 0) {
      toast.error(`แนบได้สูงสุด ${MAX_FILES} ไฟล์ต่อบทความ`);
      return;
    }

    const accepted = Array.from(fileList).slice(0, room);
    if (accepted.length < fileList.length) {
      toast.info(`เลือกได้เพียง ${room} ไฟล์ (สูงสุด ${MAX_FILES} ไฟล์)`);
    }

    const tooBig = accepted.filter((f) => f.size > MAX_CHUNKED_MB * 1024 * 1024);
    const usable = accepted.filter((f) => f.size <= MAX_CHUNKED_MB * 1024 * 1024);
    for (const file of tooBig) {
      toast.error(`${file.name} ใหญ่เกิน ${MAX_CHUNKED_MB} MB (${formatBytes(file.size)})`);
    }
    if (usable.length === 0) return;

    setUploading(true);
    progressRef.current = new Map();
    for (const f of usable) progressRef.current.set(f.name, 0);

    try {
      // Upload sequentially so progress is readable and we don't flood the tunnel.
      for (const file of usable) {
        const uploaded = await uploadAttachment(file, {
          onProgress: (fraction) => {
            progressRef.current?.set(file.name, fraction);
          },
        });

        const stored: StoredFile = {
          id: uploaded.id,
          name: uploaded.filename,
          originalName: uploaded.originalName,
          mimeType: uploaded.mimeType,
          size: uploaded.size,
          createdAt: new Date().toISOString(),
          url: `/uploads/${uploaded.filename}`,
          downloadUrl: `/uploads/${uploaded.filename}?download=1`,
        };
        setFiles((prev) => [...prev, stored]);
        progressRef.current?.delete(file.name);
      }

      if (usable.length > 0) {
        toast.success(`อัปโหลด ${usable.length} ไฟล์แล้ว`);
      }
    } catch (err) {
      toast.error((err as Error).message ?? 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  };

  const fileIcon = (file: StoredFile) => {
    const kind = fileKindOf(file.name, file.mimeType);
    const mime = file.mimeType.toLowerCase();
    if (kind === 'image') return <File size={20} className="text-brand-400" />;
    if (kind === 'media') {
      if (mime.startsWith('video/')) return <Film size={20} className="text-brand-400" />;
      if (mime.startsWith('audio/')) return <Music size={20} className="text-brand-400" />;
      return <File size={20} className="text-brand-400" />;
    }
    if (kind === 'pdf') return <File size={20} className="text-red-500" />;
    if (kind === 'doc') return <File size={20} className="text-blue-500" />;
    if (kind === 'sheet') return <File size={20} className="text-green-500" />;
    if (kind === 'slides') return <File size={20} className="text-orange-500" />;
    if (kind === 'archive') return <File size={20} className="text-amber-500" />;
    if (kind === 'text') return <File size={20} className="text-ink-500" />;
    if (kind === 'code') return <File size={20} className="text-yellow-500" />;
    if (kind === 'font') return <File size={20} className="text-ink-500" />;
    return <File size={20} className="text-ink-500" />;
  };

  if (uploading && files.length === 0) return <SpinnerPage label="กำลังเตรียมอัปโหลด" />;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <Link to="/" className="btn-ghost btn-sm -ml-2">
          <ArrowLeft size={15} /> ย้อนกลับ
        </Link>
        <div>
          <span className="text-xs text-ink-400">
            อัปโหลดได้สูงสุด {MAX_FILES} ไฟล์ · ไฟล์ละไม่เกิน{' '}
            {MAX_CHUNKED_MB >= 1024 ? `${(MAX_CHUNKED_MB / 1024).toFixed(0)} GB` : `${MAX_CHUNKED_MB} MB`}
          </span>
        </div>
      </header>

      {/* ---------- Drop zone ---------- */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-500/20 px-6 py-10 text-center transition hover:border-brand-500/50 hover:bg-surface-2/50"
      >
        <input
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.tar,.gz,.txt,.md,.csv,.json,.xml,.html,.js,.ts,.py,.go,.rs,.java,.cpp,.cs,.php,.sh,.sql,.epub,.odt,.ods,.odp,.rtf,.woff,.woff2,.ttf,.otf"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {uploading ? (
          <Loader2 size={22} className="animate-spin text-brand-500" />
        ) : (
          <Upload size={22} className="text-brand-400" />
        )}
        <p className="mt-3 text-sm font-medium text-ink-900">
          {uploading ? 'กำลังอัปโหลด…' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}
        </p>
        <p className="mt-1 text-xs text-ink-400">
          วิดีโอ รูปภาพ เสียง เอกสาร ซิป ซอร์สโค้ด และฟอนต์ · อัปโหลดทีละไฟล์
          {MAX_CHUNKED_MB >= 1024 ? ' (ไฟล์ใหญ่ถึง 1 GB ก็อัปโหลดได้)' : ''}
        </p>
      </label>

      {/* ---------- Progress bar (when any file is uploading) ---------- */}
      {uploading && progressRef.current && progressRef.current.size > 0 && (
        <div className="card p-4">
          <p className="text-xs text-ink-500 mb-2">กำลังอัปโหลด</p>
          {[...progressRef.current.entries()].map(([name, pct]) => (
            <div key={name} className="mb-2">
              <div className="flex justify-between text-xs text-ink-500 mb-0.5">
                <span className="truncate">{name}</span>
                <span>{Math.round(pct * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-200"
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Uploaded files ---------- */}
      {files.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold tracking-tight text-ink-900 mb-3">
            ไฟล์ที่อัปโหลดแล้ว ({files.length})
          </h2>
          <ul className="space-y-2">
            {files.map((file) => {
              const pct = progressRef.current.get(file.originalName);
              const isPending = pending.has(file.id);

              return (
                <li
                  key={file.id}
                  className="flex items-center gap-3 rounded-xl border border-ink-500/12 bg-surface-1 px-3 py-2.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-brand-400">
                    {fileIcon(file)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="mt-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {file.originalName}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-400">
                        {FILE_KIND_LABEL[fileKindOf(file.name, file.mimeType)]} ·
                        {formatBytes(file.size)}
                        {isPending ? (
                          <>
                            <span aria-hidden> · </span>
                            <span className="flex items-center gap-1 text-brand-400">
                              <Loader2 size={11} className="animate-spin" />
                              กำลังแนบ
                            </span>
                          </>
                        ) : null}
                      </span>
                    </div>

                    {pct !== undefined && (
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all duration-200"
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(file.id, 'รหัสไฟล์')}
                      className="btn-ghost btn-sm h-7 w-7 p-0"
                      title="คัดลอกรหัสไฟล์ (ใช้แนบกับบทความ)"
                    >
                      <Copy size={13} />
                    </button>
                    <a
                      href={file.downloadUrl}
                      download
                      className={`btn-ghost btn-sm h-7 w-7 p-0 ${
                        isPending ? 'opacity-50 pointer-events-none' : ''
                      }`}
                      title="ดาวน์โหลดไฟล์"
                    >
                      <Download size={13} />
                    </a>
                    <button
                      type="button"
                      onClick={() => discard(file.id)}
                      className="btn-ghost btn-sm h-7 w-7 p-0 text-ink-400 hover:text-red-500"
                      title="ลบไฟล์นี้"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 text-xs text-ink-500">
            <p>ไฟล์เหล่านี้ยังไม่ถูกแนบกับบทความใด ๆ</p>
            <p>
              เมื่อเขียนบทความใหม่ที่{' '}
              <a href="/posts/new" className="text-brand-400 hover:underline">
                /posts/new
              </a>
              ให้ใช้ระบบแนบไฟล์ในหน้าเขียนบทความ หรืออัปโหลดไฟล์ใหม่ที่นี่ได้เลย
            </p>
          </div>
        </section>
      )}

      {files.length === 0 && !uploading && (
        <div className="card p-8 text-center text-ink-500">
          <p>ยังไม่มีไฟล์ที่อัปโหลด</p>
          <p className="mt-2 text-xs">เลือกไฟล์จากด้านบนเพื่อเริ่มอัปโหลด</p>
        </div>
      )}
    </div>
  );
}
