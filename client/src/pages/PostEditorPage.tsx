import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bold,
  Code,
  Eye,
  Heading,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Save,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { countWords, renderMarkdown } from '../lib/markdown';
import { useSeo } from '../lib/seo';
import { Alert, SpinnerPage } from '../components/ui';
import { AttachmentPicker, type PendingUpload } from '../components/Attachments';
import { formatBytes } from '../lib/format';
import type { Attachment, Category, Post, PostStatus } from '../types';

/** Mirrors the server caps so the UI can refuse before a round trip. */
const MAX_FILES = 20;
const MAX_MB = 5;

const STATUS_OPTIOiS: Array<{ value: PostStatus; label: string }> = [
  { value: 'PUBLISHED', label: 'เผยแพร่' },
  { value: 'DRAFT', label: 'ฉบับร่าง' },
];

export function PostEditorPage() {
  const { slug } = useParams();
  const isEdit = Boolean(slug);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [saving, setSaving] = useState(false);

  useSeo({
    title: isEdit ? 'แก้ไขบทความ' : 'เขียนบทความ',
    description: 'เขียนและแก้ไขบทความบน WKSL ด้วย Markdown',
    path: isEdit ? `/posts/${slug}/edit` : '/posts/new',
    noIndex: true,
  });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<PostStatus>('PUBLISHED');
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  // Load the existing post when editing.
  const { data: existing, isLoading } = useQuery({
    queryKey: ['post', slug],
    queryFn: () => api.get<{ post: Post }>(`/posts/${slug}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existing?.post) return;
    const p = existing.post;
    setTitle(p.title);
    setContent(p.content);
    setExcerpt(p.excerpt ?? '');
    setCoverImage(p.coverImage);
    setCategoryId(p.category?.id ?? '');
    setTagsInput(p.tags.map((t) => t.name).join(', '));
    setStatus(p.status);
    setAttachments(p.attachments ?? []);
  }, [existing]);

  const insert = (before: string, after = '', placeholder = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = content.slice(start, end) || placeholder;
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const uploadCover = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await api.upload<{ url: string }>('/uploads/image', fd);
      setCoverImage(result.url);
      toast.success('อัปโหลดรูปภาพสำเร็จ');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Uploads files to the server first, which returns attachment ids. The ids
   * ride along with the post payload and are claimed when the post is saved.
   * A file the user then removes is discarded explicitly so it does not linger.
   */
  const addAttachments = async (files: File[]) => {
    const room = MAX_FILES - attachments.length - pending.length;
    if (room <= 0) {
      toast.error(`แนบได้สูงสุด ${MAX_FILES} ไฟล์`);
      return;
    }

    const accepted = files.slice(0, room);
    if (accepted.length < files.length) {
      toast.info(`เลือกได้เพียง ${room} ไฟล์ (สูงสุด ${MAX_FILES} ไฟล์)`);
    }

    const tooBig = accepted.filter((f) => f.size > MAX_MB * 1024 * 1024);
    const usable = accepted.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    for (const file of tooBig) {
      toast.error(`${file.name} ใหญ่เกิน ${MAX_MB} MB (${formatBytes(file.size)})`);
    }
    if (usable.length === 0) return;

    setUploadingFiles(true);
    try {
      const fd = new FormData();
      for (const file of usable) fd.append('files', file);
      const result = await api.upload<{
        files: Array<{ id: string; originalName: string; mimeType: string; size: number }>;
      }>('/uploads/files', fd);

      setPending((prev) => [
        ...prev,
        ...result.files.map((f) => ({
          localId: `${f.id}-${prev.length}-${Math.random().toString(36).slice(2, 7)}`,
          id: f.id,
          name: f.originalName,
          mimeType: f.mimeType,
          size: f.size,
        })),
      ]);
      toast.success(`อัปโหลด ${result.files.length} ไฟล์แล้ว — อย่าลืมกดบันทึกเพื่อแนบ`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingFiles(false);
    }
  };

  const discardPending = async (localId: string) => {
    const target = pending.find((f) => f.localId === localId);
    setPending((prev) => prev.filter((f) => f.localId !== localId));
    if (!target) return;
    try {
      await api.delete(`/uploads/files/${target.id}`);
    } catch {
      // The maintenance job reclaims it if this call does not land.
    }
  };

  const removeSavedAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setRemovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const buildPayload = () => ({
    title: title.trim(),
    content: content.trim(),
    excerpt: excerpt.trim() || undefined,
    coverImage,
    categoryId: categoryId || null,
    tags: tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8),
    attachmentIds: pending.map((f) => f.id),
    removedAttachmentIds: removedIds,
    status,
    featured: false,
  });

  const validate = (): string | null => {
    if (title.trim().length < 5) return 'หัวข้อต้องมีอย่างน้อย 5 ตัวอักษร';
    if (content.trim().length < 20) return 'เนื้อหาต้องมีอย่างน้อย 20 ตัวอักษร';
    return null;
  };

  const handleSave = async (nextStatus?: PostStatus) => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    setLoadError(null);
    if (nextStatus) setStatus(nextStatus);
    const payload = { ...buildPayload(), ...(nextStatus ? { status: nextStatus } : {}) };
    try {
      const post = isEdit
        ? await api.patch<Post>(`/posts/${existing!.post.id}`, payload)
        : await api.post<Post>('/posts', payload);
      toast.success(
        nextStatus === 'DRAFT'
          ? 'บันทึกเป็นฉบับร่างแล้ว'
          : isEdit
            ? 'บันทึกการแก้ไขแล้ว'
            : 'เผยแพร่บทความแล้ว',
      );
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post', post.slug] });
      setPending([]);
      setRemovedIds([]);
      navigate(`/posts/${post.slug}`, { replace: true });
    } catch (err) {
      setLoadError((err as Error).message);
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && isLoading) return <SpinnerPage label="กำลังโหลดบทความ" />;

  if (isEdit && loadError && !existing) {
    return (
      <div className="card p-8 text-center">
        <Alert>{loadError}</Alert>
        <Link to="/" className="btn-primary mt-4">
          <ArrowLeft size={15} /> กลับหน้าแรก
        </Link>
      </div>
    );
  }

  const words = countWords(content);
  const readMinutes = Math.max(1, Math.round(words / 200));
  const tags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const toolbar = [
    { icon: Heading, label: 'หัวข้อ', action: () => insert('## ', '', 'หัวข้อ') },
    { icon: Bold, label: 'ตัวหนา', action: () => insert('**', '**', 'ตัวหนา') },
    { icon: Italic, label: 'ตัวเอียง', action: () => insert('*', '*', 'เอียง') },
    { icon: Code, label: 'โค้ด', action: () => insert('`', '`', 'code') },
    { icon: Quote, label: 'อ้างอิง', action: () => insert('> ', '', 'คำอ้างอิง') },
    { icon: List, label: 'รายการ', action: () => insert('- ', '', 'รายการ') },
    { icon: ListOrdered, label: 'รายการมีเลข', action: () => insert('1. ', '', 'รายการ') },
    { icon: Link2, label: 'ลิงก์', action: () => insert('[', '](https://)', 'ข้อความลิงก์') },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(-1)} className="btn-ghost btn-sm -ml-2">
          <ArrowLeft size={15} /> ย้อนกลับ
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setPreview((v) => !v)}
          >
            <Eye size={14} /> {preview ? 'เขียนต่อ' : 'ตัวอย่าง'}
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => handleSave('DRAFT')}
            disabled={saving}
          >
            <Save size={14} /> บันทึกร่าง
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => handleSave('PUBLISHED')}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            เผยแพร่
          </button>
        </div>
      </div>

      {loadError && <Alert>{loadError}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="card p-5 sm:p-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="หัวข้อบทความที่น่าสนใจ…"
            className="w-full border-0 bg-transparent text-2xl font-bold tracking-tight placeholder:text-ink-400 focus:outline-none"
            maxLength={180}
            autoFocus={!isEdit}
          />

          {/* Toolbar */}
          <div className="mt-4 flex flex-wrap items-center gap-1 border-y border-ink-500/10 py-2">
            {toolbar.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={t.action}
                title={t.label}
                className="btn-ghost btn-sm h-8 w-8 p-0"
              >
                <t.icon size={15} />
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 text-xs text-ink-400">
              <span>{words} คำ</span>
              <span>·</span>
              <span>อ่าน ~{readMinutes} นาที</span>
            </div>
          </div>

          {preview ? (
            <div
              className="prose-wksl mt-4 min-h-[320px]"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content || '_ยังไม่มีเนื้อหา_') }}
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'เขียนเนื้อหาของคุณที่นี่…\n\nรองรับ Markdown: **ตัวหนา**, *ตัวเอียง*, `โค้ด`, ## หัวข้อ, - รายการ, > อ้างอิง'}
              className="mt-4 min-h-[320px] w-full resize-y border-0 bg-transparent font-mono text-sm leading-7 placeholder:font-sans placeholder:text-ink-400 focus:outline-none"
              maxLength={60000}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="card space-y-4 p-5">
            <div>
              <span className="label">สถานะ</span>
              <div className="flex gap-2">
                {STATUS_OPTIOiS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={`btn-sm flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      status === s.value
                        ? 'bg-brand-500 font-semibold text-black'
                        : 'border border-ink-500/15 text-ink-500 hover:bg-surface-2'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="category">
                หมวดหมู่
              </label>
              <select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="input"
              >
                <option value="">ไม่ระบุ</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="tags">
                แท็ก (คั่นด้วยจุลภาค, สูงสุด 8)
              </label>
              <input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="react, typescript, websocket"
                className="input"
              />
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span key={t} className="badge bg-brand-500/10 text-brand-400 dark:text-brand-400">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label" htmlFor="excerpt">
                คำอธิบายย่อ (ถ้าไม่กรอกจะสร้างให้อัตโนมัติ)
              </label>
              <textarea
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={3}
                maxLength={300}
                className="input resize-y"
              />
            </div>
          </div>

          <div className="card p-5">
            <span className="label">ภาพปก</span>
            {coverImage ? (
              <div className="relative overflow-hidden rounded-xl">
                <img src={coverImage} alt="ภาพปก" className="aspect-[16/9] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setCoverImage(null)}
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white transition hover:bg-black/80"
                  aria-label="ลบภาพปก"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-500/20 px-4 py-8 text-center transition hover:border-brand-500/40 hover:bg-surface-2/50">
                {uploading ? (
                  <Loader2 size={22} className="animate-spin text-brand-500" />
                ) : (
                  <ImageIcon size={22} className="text-ink-400" />
                )}
                <span className="text-xs text-ink-500">
                  {uploading ? 'กำลังอัปโหลด…' : 'คลิกเพื่ออัปโหลดภาพ (สูงสุด 5 MB)'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadCover(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}

            <button
              type="button"
              onClick={async () => {
                const url = window.prompt('วาง URL รูปภาพที่ต้องการใช้');
                if (url) setCoverImage(url);
              }}
              className="btn-secondary btn-sm mt-3 w-full"
            >
              <Upload size={13} /> ใช้ URL ภาพแทน
            </button>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="label mb-0">ไฟล์แนบ</span>
              {uploadingFiles && (
                <span className="flex items-center gap-1.5 text-xs text-brand-400">
                  <Loader2 size={12} className="animate-spin" />
                  กำลังอัปโหลด
                </span>
              )}
            </div>

            <AttachmentPicker
              attachments={attachments}
              pending={pending}
              onAdd={(files) => void addAttachments(Array.from(files))}
              onRemoveSaved={removeSavedAttachment}
              onDiscardPending={(id) => void discardPending(id)}
              max={MAX_FILES}
              maxMb={MAX_MB}
              disabled={saving}
            />

            {pending.length > 0 && (
              <p className="mt-3 text-xs text-ink-400">
                ไฟล์ที่อัปโหลดแล้วจะถูกแนบจริงเมื่อกดบันทึก
              </p>
            )}
          </div>

          <div className="card p-5 text-xs leading-relaxed text-ink-500">
            <p className="mb-2 font-semibold text-ink-700">เคล็ดลับการเขียน</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>หัวข้อชัดเจน บอกให้ผู้อ่านรู้ว่าจะได้อะไร</li>
              <li>ย่อหน้าสั้น 2-3 บรรทัด เพื่อให้อ่านง่าย</li>
              <li>ใส่ตัวอย่างโค้ดหรือรูปภาพประกอบ</li>
              <li>แนบไฟล์ต้นฉบับ (PDF, zip, ชุดโค้ด) ให้ผู้อ่านดาวน์โหลดได้</li>
              <li>เลือกหมวดหมู่และแท็กให้ตรงกลุ่มผู้อ่าน</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}