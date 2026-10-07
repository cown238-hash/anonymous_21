import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bookmark,
  CloudMoon,
  Eye,
  FileText,
  Heart,
  Loader2,
  MessageCircle,
  PenSquare,
  Send,
  TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { formatNumber, timeAgo } from '../lib/format';
import { Avatar, EmptyState, SkeletonList } from '../components/ui';
import type { ActivityBucket, Overview, Paginated, Post, UserStats } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const stats = useQuery({
    queryKey: ['stats', 'me'],
    queryFn: () => api.get<UserStats>('/stats/me'),
    enabled: Boolean(user),
  });

  const overview = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => api.get<Overview>('/stats/overview'),
  });

  const myPosts = useQuery({
    queryKey: ['my-posts'],
    queryFn: () => api.get<Paginated<Post>>('/posts/mine/list?perPage=6'),
    enabled: Boolean(user),
  });

  const online = useQuery({
    queryKey: ['users', 'online'],
    queryFn: () => api.get<Array<UserStats & { id: string }>>('/users/online'),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/posts/${id}`),
    onSuccess: () => {
      toast.success('ลบบทความแล้ว');
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err) => toast.error(err.message),
  });

  if (!user) return null;

  const cards = [
    { label: 'บทความของฉัน', value: stats.data?.posts ?? 0, icon: FileText, color: 'text-brand-500' },
    { label: 'ฉบับร่าง', value: stats.data?.drafts ?? 0, icon: PenSquare, color: 'text-warn' },
    { label: 'ความคิดเห็น', value: stats.data?.comments ?? 0, icon: MessageCircle, color: 'text-accent-500' },
    {
      label: 'ได้รับถูกใจ',
      value: stats.data?.likesReceived ?? 0,
      icon: Heart,
      color: 'text-danger',
    },
    {
      label: 'ยอดเข้าชมรวม',
      value: stats.data?.viewsTotal ?? 0,
      icon: Eye,
      color: 'text-brand-400',
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.displayName} src={user.avatarUrl} size="lg" online />
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              สวัสดี, {user.displayName.split(' ')[0]} 👋
            </h1>
            <p className="text-sm text-ink-500">นี่คือภาพรวมกิจกรรมของคุณ</p>
          </div>
        </div>
        <Link to="/posts/new" className="btn-primary">
          <PenSquare size={15} /> เขียนบทความ
        </Link>
      </header>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center justify-between">
              <span className={`grid h-9 w-9 place-items-center rounded-xl bg-surface-2 ${c.color}`}>
                <c.icon size={17} />
              </span>
              {stats.isFetching && <Loader2 size={12} className="animate-spin text-ink-400" />}
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight">{formatNumber(c.value)}</p>
            <p className="text-xs text-ink-400">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            to: '/bookmarks',
            icon: Bookmark,
            label: 'บทความที่บันทึกไว้',
            hint: 'กลับไปอ่านเนื้อหาที่คุณสนใจ',
          },
          {
            to: '/chat',
            icon: Send,
            label: 'ข้อความใหม่',
            hint: `คุณมี ${stats.data?.unreadMessages ?? 0} ข้อความที่ยังไม่ได้อ่าน`,
          },
          {
            to: '/explore',
            icon: TrendingUp,
            label: 'สำรวจคอนเทนต์',
            hint: 'ดูสิ่งที่กำลังมาแรงในชุมชน',
          },
        ].map((q) => (
          <Link key={q.to} to={q.to} className="card card-hover flex items-center gap-3.5 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-400 dark:text-brand-400">
              <q.icon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{q.label}</span>
              <span className="block truncate text-xs text-ink-400">{q.hint}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* My posts */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FileText size={15} className="text-brand-500" /> บทความของฉัน
            </h2>
            {myPosts.data && myPosts.data.meta.total > 0 && (
              <span className="text-xs text-ink-400">{myPosts.data.meta.total} บทความ</span>
            )}
          </div>

          {myPosts.isLoading ? (
            <SkeletonList count={2} />
          ) : !myPosts.data?.items.length ? (
            <EmptyState
              icon={<PenSquare size={30} />}
              title="ยังไม่มีบทความ"
              description="เริ่มเขียนบทความแรกของคุณ แล้วชุมชนจะได้รับความรู้จากคุณ"
              action={
                <Link to="/posts/new" className="btn-primary">
                  <PenSquare size={15} /> เขียนบทความ
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-500/8">
              {myPosts.data.items.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/posts/${p.slug}`} className="block">
                      <span className="block truncate text-sm font-medium hover:underline">{p.title}</span>
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
                      <span className="flex items-center gap-1">
                        <Eye size={11} /> {formatNumber(p.viewCount)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={11} /> {p.commentCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart size={11} /> {p.likeCount}
                      </span>
                      <span>· {timeAgo(p.updatedAt)}</span>
                      {p.status !== 'PUBLISHED' && (
                        <span className="badge bg-warn/10 text-warn dark:text-warn">
                          {p.status === 'DRAFT' ? 'ฉบับร่าง' : 'เก็บถาวร'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Link to={`/posts/${p.slug}/edit`} className="btn-ghost btn-sm h-8 px-2.5 text-xs">
                      แก้ไข
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`ลบ “${p.title}” ?`)) deleteMutation.mutate(p.id);
                      }}
                      className="btn-ghost btn-sm h-8 w-8 p-0 text-ink-400 hover:text-red-500"
                      title="ลบ"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          {/* Top performing */}
          {stats.data?.recentViews && stats.data.recentViews.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 size={15} className="text-accent-500" /> ผลงานที่ทำผลงานได้ดีที่สุด
              </h2>
              <ol className="space-y-2.5">
                {stats.data.recentViews.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className="w-4 text-center text-xs font-bold text-ink-400">{i + 1}</span>
                    <Link to={`/posts/${p.slug}`} className="min-w-0 flex-1">
                      <span className="block truncate text-sm hover:underline">{p.title}</span>
                      <span className="text-[11px] text-ink-400">
                        {formatNumber(p.viewCount)} วิว · {p._count.likes} ถูกใจ
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Activity sparkline */}
          {overview.data && (
            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <CloudMoon size={15} className="text-brand-400" /> กิจกรรมทั้งชุมชน
              </h2>
              <Sparkline data={overview.data.activity} />
              <div className="mt-3 flex justify-between text-[10px] text-ink-400">
                <span>14 วันก่อน</span>
                <span>วันนี้</span>
              </div>
            </section>
          )}

          {/* Online */}
          {online.data && online.data.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                  <span className="relative h-2 w-2 rounded-full bg-brand-500" />
                </span>
                ออนไลน์ ({online.data.length})
              </h2>
              <ul className="space-y-2">
                {online.data.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/u/${(o as unknown as { username: string }).username}`}
                      className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition hover:bg-surface-2"
                    >
                      <Avatar
                        name={(o as unknown as { displayName: string }).displayName}
                        src={(o as unknown as { avatarUrl: string | null }).avatarUrl}
                        size="xs"
                        online
                      />
                      <span className="truncate text-xs">
                        {(o as unknown as { displayName: string }).displayName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: ActivityBucket[] }) {
  const values = data.map((d) => d.posts + d.comments);
  const max = Math.max(1, ...values);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * 100;
      const y = 100 - (v / max) * 90;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${points} 100,100`} fill="url(#spark)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}