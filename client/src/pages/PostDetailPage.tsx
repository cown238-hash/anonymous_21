import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  Eye,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Send,
  Share2,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocketEvents } from '../lib/realtime';
import { renderMarkdown } from '../lib/markdown';
import { toast } from '../lib/toast';
import { formatDateTime, formatNumber, timeAgo } from '../lib/format';
import { useSeo } from '../lib/seo';
import { Alert, Avatar, Badge, StatusBadge, EmptyState, SpinnerPage } from '../components/ui';
import { PostCard, HeartIcon } from '../components/PostCard';
import { CommentSection } from '../components/CommentSection';
import { AttachmentList } from '../components/Attachments';
import { ReportButton } from '../components/ReportButton';
import type { Paginated, Post } from '../types';

interface PostDetailResponse {
  post: Post;
  related: Post[];
}

export function PostDetailPage() {
  const { slug = '' } = useParams();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { connected } = useSocketEvents();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['post', slug],
    queryFn: () => api.get<PostDetailResponse>(`/posts/${slug}`),
  });

  const post = data?.post;

  useSeo({
    title: post?.title ?? slug,
    description:
      post?.excerpt ?? `อ่านบทความ “${post?.title ?? slug}” โดย ${post?.author.displayName ?? 'สมาชิก'} บน WKSL`,
    path: `/posts/${slug}`,
    type: 'article',
    image: post?.coverImage ?? post?.author.avatarUrl ?? null,
    publishedAt: post?.publishedAt ?? null,
    author: post?.author.displayName ?? null,
  });

  // Live view counter + like echo while browsing.
  useEffect(() => {
    if (!post) return;
    const onMessage = (e: StorageEvent) => {
      if (e.key === `like:${post.id}` && e.newValue) {
        void e.newValue;
      }
    };
    window.addEventListener('storage', onMessage);
    return () => window.removeEventListener('storage', onMessage);
  }, [post]);

  const likeMutation = useMutation({
    mutationFn: () => api.post<{ liked: boolean; likeCount: number }>(`/posts/${post!.id}/like`),
    onSuccess: (result) => {
      queryClient.setQueryData<PostDetailResponse>(['post', slug], (prev) =>
        prev
          ? {
              ...prev,
              post: {
                ...prev.post,
                likedByMe: result.liked,
                likeCount: result.likeCount,
              },
            }
          : prev,
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/posts/${post!.id}`),
    onSuccess: () => {
      toast.success('ลบบทความเรียบร้อยแล้ว');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate('/');
    },
    onError: (err) => toast.error(err.message),
  });

  const share = async () => {
    if (!post) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('คัดลอกลิงก์แล้ว');
      }
    } catch {
      /* user cancelled */
    }
  };

  const related = useMemo(() => data?.related ?? [], [data]);

  if (isLoading) return <SpinnerPage label="กำลังโหลดบทความ" />;

  if (isError || !post) {
    return (
      <div className="card">
        <EmptyState
          icon={<MessageSquare size={34} />}
          title="ไม่พบบทความนี้"
          description={error instanceof Error ? error.message : 'บทความอาจถูกลบไปแล้ว'}
          action={
            <Link to="/" className="btn-primary">
              <ArrowLeft size={15} /> กลับหน้าแรก
            </Link>
          }
        />
      </div>
    );
  }

  const canManage = user && (user.id === post.author.id || isAdmin);

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => navigate(-1)} className="btn-ghost btn-sm -ml-2">
        <ArrowLeft size={15} /> ย้อนกลับ
      </button>

      <article className="card overflow-hidden">
        {post.coverImage && (
          <img
            src={post.coverImage}
            alt={post.title}
            className="max-h-96 w-full object-cover"
          />
        )}

        <div className="p-6 sm:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {post.featured && (
              <Badge className="bg-warn/10 text-warn dark:text-warn">แนะนำ</Badge>
            )}
            <StatusBadge status={post.status} />
            {post.category && (
              <Link to={`/?category=${post.category.slug}`}>
                <Badge color={post.category.color}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {post.category.name}
                </Badge>
              </Link>
            )}
          </div>

          <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{post.title}</h1>

          <div className="mt-5 flex flex-wrap items-center gap-4 border-y border-ink-500/10 py-4">
            <Link to={`/u/${post.author.username}`} className="flex items-center gap-3">
              <Avatar name={post.author.displayName} src={post.author.avatarUrl} size="md" online />
              <span>
                <span className="block text-sm font-semibold">{post.author.displayName}</span>
                <span className="block text-xs text-ink-400">
                  @{post.author.username} · {timeAgo(post.publishedAt ?? post.createdAt)}
                </span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-1 text-xs text-ink-400">
              <span className="flex items-center gap-1 px-2 py-1">
                <Clock size={13} /> {post.readMinutes} นาที
              </span>
              <span className="flex items-center gap-1 px-2 py-1">
                <Eye size={13} /> {formatNumber(post.viewCount)}
              </span>
              <button type="button" onClick={share} className="btn-ghost btn-sm" title="แชร์">
                <Share2 size={14} />
              </button>
              {user && (
                <ReportButton targetType="post" targetId={post.id} label="รายงาน" className="btn-ghost btn-sm" />
              )}

              {canManage && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="btn-ghost btn-sm"
                    aria-label="ตัวเลือก"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {menuOpen && (
                    <div
                      className="card animate-pop absolute right-0 z-20 mt-1 w-44 overflow-hidden p-1.5 shadow-xl"
                      onMouseLeave={() => setMenuOpen(false)}
                    >
                      <Link
                        to={`/posts/${post.slug}/edit`}
                        className="menu-item w-full"
                        onClick={() => setMenuOpen(false)}
                      >
                        แก้ไขบทความ
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`ยืนยันการลบ “${post.title}” ?`)) deleteMutation.mutate();
                          setMenuOpen(false);
                        }}
                        className="menu-item w-full text-red-500"
                      >
                        <Trash2 size={14} /> ลบบทความ
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Rendered markdown */}
          <div
            className="prose-wksl mt-6"
            // Content is escaped inside renderMarkdown before being turned into HTML.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
          />

          {post.attachments.length > 0 && (
            <div className="mt-8">
              <AttachmentList attachments={post.attachments} />
            </div>
          )}

          {post.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2 border-t border-ink-500/10 pt-6">
              {post.tags.map((t) => (
                <Link
                  key={t.id}
                  to={`/?tag=${t.slug}`}
                  className="badge bg-surface-2 text-ink-500 transition hover:bg-brand-500/10 hover:text-brand-400 dark:hover:text-brand-400"
                >
                  #{t.name}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!user) return toast.info('กรุณาเข้าสู่ระบบก่อนกดถูกใจ');
                likeMutation.mutate();
              }}
              aria-pressed={post.likedByMe}
              disabled={likeMutation.isPending}
              className={`btn gap-2 ${
                post.likedByMe
                  ? 'bg-danger/12 text-danger'
                  : 'border border-ink-500/20 text-ink-500 hover:bg-surface-2'
              }`}
            >
              {likeMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <HeartIcon filled={post.likedByMe} size={16} />
              )}
              {formatNumber(post.likeCount)}
            </button>
            <a href="#comments" className="btn-ghost gap-2">
              <MessageSquare size={16} />
              {formatNumber(post.commentCount)} ความคิดเห็น
            </a>
          </div>
        </div>
      </article>

      <CommentSection postId={post.id} />

      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-500">อ่านต่อ</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {related.map((p) => (
              <PostCard key={p.id} post={p} compact />
            ))}
          </div>
        </section>
      )}

      {!connected && user && (
        <Alert kind="info">
          ขณะนี้เชื่อมต่อแบบเรียลไทม์ไม่ได้ — ระบบกำลังพยายามเชื่อมต่อใหม่อยู่
        </Alert>
      )}

      <p className="pt-2 text-center text-xs text-ink-400">
        เผยแพร่เมื่อ {formatDateTime(post.publishedAt ?? post.createdAt)} · ปรับปรุงล่าสุด{' '}
        {formatDateTime(post.updatedAt)}
      </p>
      <span className="hidden">
        <Send size={1} />
        <UserIcon size={1} />
      </span>
    </div>
  );
}

export type { Paginated };