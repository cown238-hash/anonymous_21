import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  BarChart3,
  CheckCircle2,
  FileText,
  MessageCircle,
  Search,
  Shield,
  Star,
  Users as UsersIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { api, qs } from '../lib/api';
import { toast } from '../lib/toast';
import { formatNumber, timeAgo } from '../lib/format';
import { useSeo } from '../lib/seo';
import { Alert, Avatar, EmptyState, StatusBadge, SkeletonList } from '../components/ui';
import { Pagination } from '../components/Pagination';
import { ReportsTab } from '../components/ReportsTab';
import type { AdminPost, AdminStats, AdminUser, Paginated } from '../types';

type Tab = 'overview' | 'users' | 'posts' | 'reports';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const queryClient = useQueryClient();

  useSeo({
    title: 'แผงผู้ดูแลระบบ',
    description: 'จัดการสมาชิก บทความ และคิวรายงานเนื้อหาบน WKSL',
    path: '/admin',
    noIndex: true,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  };

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStats>('/admin/stats'),
    refetchInterval: 60_000,
  });

  const tabs: Array<{ key: Tab; label: string; icon: typeof BarChart3 }> = [
    { key: 'overview', label: 'ภาพรวม', icon: BarChart3 },
    { key: 'users', label: 'จัดการผู้ใช้', icon: UsersIcon },
    { key: 'posts', label: 'จัดการบทความ', icon: FileText },
    { key: 'reports', label: 'รายงานเนื้อหา', icon: Shield },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Shield size={20} className="text-brand-500" /> แผงผู้ดูแลระบบ
          </h1>
          <p className="mt-1 text-sm text-ink-500">ตรวจสอบและจัดการเนื้อหากับสมาชิก</p>
        </div>
        {stats && (
          <span className="text-xs text-ink-400">อัปเดตเมื่อ {timeAgo(stats.generatedAt)}</span>
        )}
      </header>

      <div className="flex gap-1 border-b border-ink-500/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition',
              tab === t.key ? 'text-brand-400 dark:text-brand-400' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            <t.icon size={15} />
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500" />
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab stats={stats} loading={isLoading} />}
      {tab === 'users' && <UsersTab onChanged={invalidateAll} />}
      {tab === 'posts' && <PostsTab onChanged={invalidateAll} />}
      {tab === 'reports' && <ReportsTab onChanged={invalidateAll} />}
    </div>
  );
}

function OverviewTab({ stats, loading }: { stats?: AdminStats; loading: boolean }) {
  if (loading) return <SkeletonList count={2} />;
  if (!stats) return <Alert>ไม่สามารถโหลดสถิติได้</Alert>;

  const cards = [
    { label: 'ผู้ใช้ทั้งหมด', value: stats.totals.users, hint: `+${stats.recent.users7d} ใน 7 วัน`, icon: UsersIcon },
    { label: 'บทความ', value: stats.totals.posts, hint: `+${stats.recent.posts7d} ใน 7 วัน`, icon: FileText },
    { label: 'ความคิดเห็น', value: stats.totals.comments, hint: 'ทั้งหมด', icon: MessageCircle },
    { label: 'ข้อความแชท', value: stats.totals.messages, hint: 'ทั้งหมด', icon: MessageCircle },
    { label: 'หมวดหมู่', value: stats.totals.categories, hint: 'ในระบบ', icon: FileText },
    { label: 'บัญชีถูกระงับ', value: stats.totals.banned, hint: 'รอตรวจสอบ', icon: Ban },
    { label: 'ฉบับร่าง', value: stats.totals.drafts, hint: 'ยังไม่เผยแพร่', icon: FileText },
    { label: 'การแจ้งเตือน', value: stats.totals.notifications, hint: 'ทั้งหมด', icon: BarChart3 },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <c.icon size={13} />
              {c.label}
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{formatNumber(c.value)}</p>
            <p className="text-[11px] text-ink-400">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">บทความยอดเข้าชมสูงสุด</h2>
          <ol className="space-y-2">
            {stats.topPosts.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="w-5 text-center text-xs font-bold text-ink-400">{i + 1}</span>
                <Link to={`/posts/${p.slug}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {p.title}
                </Link>
                <span className="shrink-0 text-xs text-ink-400">
                  {formatNumber(p.viewCount)} วิว · {p._count.likes} ❤
                </span>
              </li>
            ))}
            {stats.topPosts.length === 0 && <li className="text-sm text-ink-400">ยังไม่มีข้อมูล</li>}
          </ol>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">สมาชิกใหม่</h2>
          <ul className="space-y-2">
            {stats.recentUsers.map((u) => (
              <li key={u.id}>
                <Link
                  to={`/u/${u.username}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2"
                >
                  <Avatar name={u.displayName} src={u.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.displayName}</span>
                    <span className="block text-[11px] text-ink-400">@{u.username}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-400">{timeAgo(u.createdAt)}</span>
                </Link>
              </li>
            ))}
            {stats.recentUsers.length === 0 && <li className="text-sm text-ink-400">ยังไม่มีข้อมูล</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function UsersTab({ onChanged }: { onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search, page],
    queryFn: () => api.get<Paginated<AdminUser>>(`/admin/users${qs({ q: search, page, perPage: 12 })}`),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: 'USER' | 'ADMIN'; isBanned?: boolean }) =>
      api.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      toast.success('อัปเดตผู้ใช้แล้ว');
      onChanged();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <div className="card mb-4 p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาอีเมล ชื่อผู้ใช้ หรือชื่อที่แสดง…"
            className="input pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <SkeletonList count={4} />
      ) : !data?.items.length ? (
        <div className="card">
          <EmptyState title="ไม่พบผู้ใช้" />
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-ink-500/10 bg-surface-2/50 text-left text-xs text-ink-400">
                    <th className="px-4 py-3 font-medium">ผู้ใช้</th>
                    <th className="px-4 py-3 font-medium">บทความ</th>
                    <th className="px-4 py-3 font-medium">ความคิดเห็น</th>
                    <th className="px-4 py-3 font-medium">สถานะ</th>
                    <th className="px-4 py-3 font-medium">เข้าร่วม</th>
                    <th className="px-4 py-3 text-right font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-500/8">
                  {data.items.map((u) => (
                    <tr key={u.id} className="transition hover:bg-surface-2/40">
                      <td className="px-4 py-3">
                        <Link to={`/u/${u.username}`} className="flex items-center gap-2.5">
                          <Avatar name={u.displayName} src={u.avatarUrl} size="sm" />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 font-medium">
                              <span className="truncate">{u.displayName}</span>
                              {u.isHidden && (
                                <span className="badge shrink-0 border border-warn/30 bg-warn/10 text-warn" title="ผู้ใช้ซ่อนโปรไฟล์จากรายชื่อสมาชิก">
                                  ซ่อนอยู่
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11px] text-ink-400">@{u.username}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-500">{u.postCount}</td>
                      <td className="px-4 py-3 text-ink-500">{u.commentCount}</td>
                      <td className="px-4 py-3">
                        {u.isBanned ? (
                          <span className="badge bg-red-500/12 text-red-500">ระงับ</span>
                        ) : u.role === 'ADMIN' ? (
                          <span className="badge bg-brand-500/12 text-brand-400 dark:text-brand-400">
                            แอดมิน
                          </span>
                        ) : (
                          <span className="badge border border-brand-500/30 bg-brand-500/10 text-brand-400">ปกติ</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-400">{timeAgo(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              patchMutation.mutate({
                                id: u.id,
                                role: u.role === 'ADMIN' ? 'USER' : 'ADMIN',
                              })
                            }
                            className="btn-ghost btn-sm h-7 px-2 text-[11px]"
                            title={u.role === 'ADMIN' ? 'ลดระดับเป็นผู้ใช้' : 'เลื่อนเป็นแอดมิน'}
                          >
                            <Shield size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => patchMutation.mutate({ id: u.id, isBanned: !u.isBanned })}
                            className="btn-ghost btn-sm h-7 w-7 p-0"
                            title={u.isBanned ? 'ปลดระงับ' : 'ระงับบัญชี'}
                          >
                            {u.isBanned ? (
                              <CheckCircle2 size={13} className="text-brand-400" />
                            ) : (
                              <Ban size={13} className="text-warn" />
                            )}
                          </button>
                          {/* Permanent deletion is intentionally not exposed here.
                              `DELETE /api/admin/users/:id` still exists for scripted
                              or break-glass use — ban, or let the user delete their
                              own account from Settings. */}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.meta.totalPages > 1 && (
            <Pagination
              className="mt-6"
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}

function PostsTab({ onChanged }: { onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'posts', search, page],
    queryFn: () => api.get<Paginated<AdminPost>>(`/admin/posts${qs({ q: search, page, perPage: 12 })}`),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; featured?: boolean; status?: string }) =>
      api.patch(`/admin/posts/${id}`, body),
    onSuccess: () => {
      toast.success('อัปเดตบทความแล้ว');
      onChanged();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <div className="card mb-4 p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาบทความตามชื่อหรือเนื้อหา…"
            className="input pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <SkeletonList count={4} />
      ) : !data?.items.length ? (
        <div className="card">
          <EmptyState title="ไม่พบบทความ" />
        </div>
      ) : (
        <>
          <ul className="card divide-y divide-ink-500/8 overflow-hidden">
            {data.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/posts/${p.slug}`} className="block truncate font-medium hover:underline">
                    {p.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
                    <Avatar name={p.author.displayName} src={p.author.avatarUrl} size="xs" />
                    <span>@{p.author.username}</span>
                    <span>·</span>
                    <span>{formatNumber(p.viewCount)} วิว</span>
                    <span>· {p.commentCount} ความคิดเห็น</span>
                    <span>· {p.likeCount} ถูกใจ</span>
                    <span>· {timeAgo(p.createdAt)}</span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => patchMutation.mutate({ id: p.id, featured: !p.featured })}
                    className={clsx('btn-secondary btn-sm h-8 px-2.5 text-xs', p.featured && 'text-warn')}
                    title={p.featured ? 'ยกเลิกแนะนำ' : 'ตั้งเป็นแนะนำ'}
                  >
                    <Star size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchMutation.mutate({
                        id: p.id,
                        status: p.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED',
                      })
                    }
                    className="btn-secondary btn-sm h-8 px-2.5 text-xs"
                    title={p.status === 'PUBLISHED' ? 'เก็บถาวร' : 'เผยแพร่'}
                  >
                    {p.status === 'PUBLISHED' ? 'เก็บถาวร' : 'เผยแพร่'}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {data.meta.totalPages > 1 && (
            <Pagination
              className="mt-6"
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}