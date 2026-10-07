import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Heart,
  Loader2,
  MessageCircle,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { api, qs } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useSeo } from '../lib/seo';
import { Alert, Avatar, EmptyState, SkeletonList } from '../components/ui';
import type { Notification, Paginated } from '../types';

const ICOiS = {
  COMMENT: MessageCircle,
  REPLY: MessageSquare,
  LIKE: Heart,
  MESSAGE: BellRing,
  SYSTEM: Bell,
} as const;

const COLORS = {
  COMMENT: 'text-info bg-info/10',
  REPLY: 'text-accent-400 bg-accent-400/10',
  LIKE: 'text-danger bg-danger/10',
  MESSAGE: 'text-brand-400 bg-brand-500/10',
  SYSTEM: 'text-ink-500 bg-surface-2',
} as const;

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useSeo({
    title: 'การแจ้งเตือน',
    description: 'ความคิดเห็น กดถูกใจ และข้อความที่คุณได้รับบน WKSL',
    path: '/notifications',
    noIndex: true,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () =>
      api.get<Paginated<Notification> & { unreadCount: number }>(
        `/notifications${qs({ filter, perPage: 30 })}`,
      ),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'me'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: invalidate,
  });

  const clearAll = useMutation({
    mutationFn: () => api.delete('/notifications'),
    onSuccess: invalidate,
  });

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Bell size={20} className="text-brand-500" /> การแจ้งเตือน
            {unread > 0 && (
              <span className="badge bg-danger/12 text-danger">{unread} ไม่อ่าน</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-ink-500">ความคิดเห็น กดถูกใจ และข้อความที่คุณได้รับ</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}
            className="btn-secondary btn-sm"
          >
            {filter === 'all' ? 'ดูเฉพาะที่ยังไม่อ่าน' : 'ดูทั้งหมด'}
          </button>
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending || unread === 0}
            className="btn-secondary btn-sm"
          >
            {markAllRead.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCheck size={13} />
            )}
            อ่านทั้งหมด
          </button>
        </div>
      </header>

      {isLoading ? (
        <SkeletonList count={4} />
      ) : isError ? (
        <Alert>{(error as Error).message}</Alert>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Bell size={32} />}
            title={filter === 'unread' ? 'ไม่มีการแจ้งเตือนที่ยังไม่อ่าน' : 'ยังไม่มีการแจ้งเตือน'}
            description="เมื่อมีคนโต้ตอบกับคุณ คุณจะได้รับการแจ้งเตือนที่นี่"
            action={
              items.length > 0 && (
                <button
                  type="button"
                  onClick={() => clearAll.mutate()}
                  className="btn-secondary btn-sm"
                >
                  <Trash2 size={13} /> ล้างทั้งหมด
                </button>
              )
            }
          />
        </div>
      ) : (
        <>
          <ul className="card divide-y divide-ink-500/8 overflow-hidden">
            {items.map((n) => {
              const Icon = ICOiS[n.type] ?? Bell;
              const body = (
                <>
                  {n.actor && (
                    <Avatar name={n.actor.displayName} src={n.actor.avatarUrl} size="sm" />
                  )}
                  <span
                    className={clsx(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                      COLORS[n.type] ?? COLORS.SYSTEM,
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={clsx(
                        'block text-sm leading-snug',
                        n.readAt ? 'text-ink-500' : 'font-medium text-ink-900',
                      )}
                    >
                      {n.title}
                    </span>
                    {n.body && <span className="mt-0.5 block text-xs text-ink-400">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-ink-400">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                </>
              );

              return (
                <li key={n.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/50">
                  {n.href ? (
                    <Link
                      to={n.href}
                      onClick={() => {
                        if (!n.readAt) markRead.mutate(n.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
                  )}

                  <div className="flex shrink-0 gap-1">
                    {!n.readAt && (
                      <button
                        type="button"
                        onClick={() => markRead.mutate(n.id)}
                        className="btn-ghost btn-sm h-7 w-7 p-0"
                        title="ทำเครื่องหมายว่าอ่านแล้ว"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove.mutate(n.id)}
                      className="btn-ghost btn-sm h-7 w-7 p-0 text-ink-400 hover:text-red-500"
                      title="ลบ"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => clearAll.mutate()}
            disabled={clearAll.isPending}
            className="btn-ghost btn-sm mx-auto flex text-ink-400 hover:text-red-500"
          >
            <Trash2 size={13} /> ล้างการแจ้งเตือนทั้งหมด
          </button>
        </>
      )}
    </div>
  );
}