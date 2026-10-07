import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Eye,
  FileText,
  Globe,
  Heart,
  Link as LinkIcon,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  PenSquare,
  Shield,
} from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocketEvents } from '../lib/realtime';
import { toast } from '../lib/toast';
import { formatDate, formatNumber } from '../lib/format';
import { useSeo } from '../lib/seo';
import { Alert, Avatar, EmptyState, SkeletonList } from '../components/ui';
import { Pagination } from '../components/Pagination';
import { PostCard } from '../components/PostCard';
import type { Paginated, Post, User } from '../types';

interface ProfileResponse {
  user: User;
  isOnline: boolean;
  stats: { posts: number; comments: number; likesReceived: number };
  recentPosts: Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    coverImage: string | null;
    viewCount: number;
    readMinutes: number;
    publishedAt: string | null;
    createdAt: string;
    _count: { comments: number; likes: number };
  }>;
}

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { onlineIds } = useSocketEvents();
  const [tab, setTab] = useState<'overview' | 'posts'>('overview');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.get<ProfileResponse>(`/users/${username}`),
  });

  useSeo({
    title: data?.user.displayName ?? `@${username}`,
    description: data?.user.bio ?? `โปรไฟล์และบทความของ ${username} บน WKSL`,
    path: `/u/${username}`,
    type: 'profile',
    image: data?.user.avatarUrl ?? null,
  });

  const postsQuery = useQuery({
    queryKey: ['profile', username, 'posts', page],
    queryFn: () =>
      api.get<Paginated<Post>>(`/users/${username}/posts${qs({ page, perPage: 9 })}`),
    enabled: tab === 'posts',
  });

  const startDm = useMutation({
    mutationFn: (participantId: string) => api.post<{ id: string }>('/chat/conversations', { participantId }),
    onSuccess: (convo) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/chat?c=${convo.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="card p-8">
        <div className="flex items-center gap-5">
          <div className="skeleton h-24 w-24 rounded-full" />
          <div className="flex-1 space-y-3">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="card">
        <EmptyState
          title="ไม่พบผู้ใช้นี้"
          description={error instanceof Error ? error.message : undefined}
          action={
            <Link to="/members" className="btn-primary">
              ดูสมาชิกทั้งหมด
            </Link>
          }
        />
      </div>
    );
  }

  const profile = data.user;
  const isSelf = me?.id === profile.id;
  const isOnline = data.isOnline || onlineIds.has(profile.id);

  const statCards = [
    { label: 'บทความ', value: data.stats.posts, icon: FileText },
    { label: 'ความคิดเห็น', value: data.stats.comments, icon: MessageCircle },
    { label: 'ได้รับถูกใจ', value: data.stats.likesReceived, icon: Heart },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="card overflow-hidden">
        <div className="relative h-24 overflow-hidden bg-surface-2">
          <div className="bg-grid absolute inset-0 opacity-60" />
          <div className="absolute inset-0 bg-[radial-gradient(80%_140%_at_20%_0%,color-mix(in_oklab,var(--color-brand-500)_26%,transparent),transparent)]" />
        </div>
        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-wrap items-end gap-4">
            <Avatar name={profile.displayName} src={profile.avatarUrl} size="xl" online={isOnline} ring />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">{profile.displayName}</h1>
                {profile.role === 'ADMIN' && (
                  <span className="badge bg-brand-500/12 text-brand-400 dark:text-brand-400">
                    <Shield size={11} /> ผู้ดูแลระบบ
                  </span>
                )}
                {isOnline && (
                  <span className="badge border border-brand-500/30 bg-brand-500/10 text-brand-400">
                    ออนไลน์
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-400">@{profile.username}</p>
            </div>

            <div className="flex gap-2 pb-1">
              {isSelf ? (
                <Link to="/settings" className="btn-secondary btn-sm">
                  <PenSquare size={14} /> แก้ไขโปรไฟล์
                </Link>
              ) : (
                me && (
                  <button
                    type="button"
                    onClick={() => startDm.mutate(profile.id)}
                    disabled={startDm.isPending}
                    className="btn-primary btn-sm"
                  >
                    <MessageSquarePlus size={14} /> ส่งข้อความ
                  </button>
                )
              )}
            </div>
          </div>

          {profile.bio && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-700">{profile.bio}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-400">
            {profile.location && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} /> {profile.location}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="link flex items-center gap-1.5"
              >
                <Globe size={13} /> {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar size={13} /> เข้าร่วม {formatDate(profile.createdAt)}
            </span>
          </div>

          <div className="mt-5 flex gap-6 border-t border-ink-500/10 pt-4">
            {statCards.map((s) => (
              <div key={s.label}>
                <p className="flex items-center gap-1.5 text-xs text-ink-400">
                  <s.icon size={12} />
                  {s.label}
                </p>
                <p className="text-lg font-bold">{formatNumber(s.value)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-500/10">
        {([
          ['overview', 'ภาพรวม'],
          ['posts', `บทความ (${data.stats.posts})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition ${
              tab === key ? 'text-brand-400 dark:text-brand-400' : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            {label}
            {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500" />}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          {data.recentPosts.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<FileText size={32} />}
                title="ยังไม่มีบทความ"
                description={isSelf ? 'เริ่มเขียนบทความแรกของคุณได้เลย' : 'ผู้ใช้นี้ยังไม่ได้เผยแพร่บทความ'}
                action={
                  isSelf && (
                    <Link to="/posts/new" className="btn-primary">
                      <PenSquare size={15} /> เขียนบทความ
                    </Link>
                  )
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentPosts.map((p) => (
                <Link
                  key={p.id}
                  to={`/posts/${p.slug}`}
                  className="card card-hover flex items-center gap-4 p-4"
                >
                  {p.coverImage && (
                    <img
                      src={p.coverImage}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    {p.excerpt && <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">{p.excerpt}</p>}
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-400">
                      <span className="flex items-center gap-1">
                        <Eye size={11} /> {formatNumber(p.viewCount)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={11} /> {p._count.comments}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart size={11} /> {p._count.likes}
                      </span>
                    </div>
                  </div>
                  <LinkIcon size={15} className="shrink-0 text-ink-400" />
                </Link>
              ))}
              <button
                type="button"
                onClick={() => setTab('posts')}
                className="btn-secondary btn-sm w-full"
              >
                ดูบทความทั้งหมด
              </button>
            </div>
          )}
        </>
      ) : postsQuery.isLoading ? (
        <SkeletonList count={3} />
      ) : postsQuery.isError ? (
        <Alert>{(postsQuery.error as Error).message}</Alert>
      ) : !postsQuery.data?.items.length ? (
        <div className="card">
          <EmptyState icon={<FileText size={32} />} title="ยังไม่มีบทความในหมวดนี้" />
        </div>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {postsQuery.data.items.map((p) => (
              <PostCard key={p.id} post={p} compact />
            ))}
          </div>
          {postsQuery.data.meta.totalPages > 1 && (
            <Pagination
              className="mt-8"
              page={postsQuery.data.meta.page}
              totalPages={postsQuery.data.meta.totalPages}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}