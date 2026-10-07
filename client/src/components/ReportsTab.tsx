import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Flag,
  Loader2,
  Search,
  Shield,
  Trash2,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { api, qs } from '../lib/api';
import { toast } from '../lib/toast';
import { timeAgo } from '../lib/format';
import { Alert, Avatar, EmptyState, SkeletonList } from '../components/ui';
import { Pagination } from '../components/Pagination';
import type { Paginated, User } from '../types';

type Status = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

interface ReportRow {
  id: string;
  reason: string;
  detail: string | null;
  status: Status;
  targetType: string;
  targetId: string;
  snippet: string | null;
  contentAuthor: string | null;
  url: string | null;
  reporter: User;
  createdAt: string;
}

const STATUS_META: Record<Status, { label: string; className: string }> = {
  OPEN: { label: 'รอตรวจสอบ', className: 'bg-warn/10 text-warn dark:text-warn' },
  REVIEWING: { label: 'กำลังตรวจสอบ', className: 'border border-info/30 bg-info/10 text-info' },
  RESOLVED: { label: 'ดำเนินการแล้ว', className: 'border border-brand-500/30 bg-brand-500/10 text-brand-400' },
  DISMISSED: { label: 'ไม่มีมูลเหตุ', className: 'bg-ink-500/12 text-ink-500' },
};

const REASON_LABELS: Record<string, string> = {
  SPAM: 'สแปม',
  HARASSMENT: 'การกลั่นร้าย',
  MISINFORMATION: 'ข้อมูลผิด',
  COPYRIGHT: 'ลิขสิทธิ์',
  NSFW: 'เนื้อหาไม่เหมาะสม',
  OTHER: 'อื่น ๆ',
};

/** Moderation queue for content reports submitted by members. */
export function ReportsTab({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<Status | ''>('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', status, page],
    queryFn: () =>
      api.get<Paginated<ReportRow>>(
        `/reports/admin/queue${qs({ status: status || undefined, page, perPage: 15 })}`,
      ),
  });

  const resolve = useMutation({
    mutationFn: (payload: { id: string; status: Status; removeContent?: boolean; resolution?: string }) =>
      api.patch(`/reports/admin/${payload.id}`, {
        status: payload.status,
        removeContent: payload.removeContent ?? false,
        resolution: payload.resolution,
      }),
    onSuccess: () => {
      toast.success('อัปเดตรายงานแล้ว');
      onChanged();
    },
    onError: (err) => toast.error(err.message),
  });

  const open = data?.items.filter((r) => r.status === 'OPEN').length ?? 0;

  return (
    <>
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาจากรายงานที่เห็น…"
              className="input pl-10"
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
            {(['', 'OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const).map((key) => (
              <button
                key={key || 'all'}
                type="button"
                onClick={() => {
                  setStatus(key);
                  setPage(1);
                }}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  status === key ? 'bg-surface-1 text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                {key === '' ? 'ทั้งหมด' : STATUS_META[key].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {open > 0 && (
        <Alert kind="warning" className="mb-4">
          มีรายงานที่ยังไม่ได้ตรวจสอบ <strong>{open}</strong> รายการ
        </Alert>
      )}

      {isLoading ? (
        <SkeletonList count={3} />
      ) : !data?.items.length ? (
        <div className="card">
          <EmptyState
            icon={<Shield size={32} />}
            title="ไม่มีรายงานในคิว"
            description="เนื้อหาทั้งหมดยังไม่ถูกรายงาน หรือคุณกรองจนไม่เหลือรายการ"
          />
        </div>
      ) : (
        <>
          <ul className="card divide-y divide-ink-500/8 overflow-hidden">
            {data.items
              .filter((r) => {
                if (!search.trim()) return true;
                const q = search.toLowerCase();
                return (
                  (r.snippet ?? '').toLowerCase().includes(q) ||
                  (r.contentAuthor ?? '').toLowerCase().includes(q) ||
                  r.reason.toLowerCase().includes(q)
                );
              })
              .map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={clsx('badge', STATUS_META[r.status].className)}>
                          {STATUS_META[r.status].label}
                        </span>
                        <span className="badge bg-surface-2 text-ink-500">
                          <Flag size={11} />
                          {REASON_LABELS[r.reason] ?? r.reason}
                        </span>
                        <span className="badge bg-surface-2 text-ink-500">
                          {r.targetType === 'post' ? 'บทความ' : 'ความคิดเห็น'}
                        </span>
                        <span className="text-xs text-ink-400">{timeAgo(r.createdAt)}</span>
                      </div>

                      <p className="mt-2 line-clamp-2 text-sm text-ink-700">
                        {r.snippet ?? <span className="italic text-ink-400">(เนื้อหาถูกลบแล้ว)</span>}
                      </p>

                      {r.detail && (
                        <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-500">
                          ผู้รายงาน: {r.detail}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2 text-xs text-ink-400">
                        <Avatar name={r.reporter.displayName} src={r.reporter.avatarUrl} size="xs" />
                        <span>รายงานโดย {r.reporter.displayName}</span>
                        {r.contentAuthor && (
                          <>
                            <span>·</span>
                            <span>ผู้เขียน: {r.contentAuthor}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => resolve.mutate({ id: r.id, status: 'REVIEWING' })}
                          disabled={resolve.isPending}
                          className="btn-secondary btn-sm"
                        >
                          <Loader2 size={12} className={resolve.isPending ? 'animate-spin' : ''} />
                          รับเรื่อง
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('ลบเนื้อหานี้อย่างถาวร?'))
                              resolve.mutate({
                                id: r.id,
                                status: 'RESOLVED',
                                removeContent: true,
                                resolution: 'ลบเนื้อหาตามรายงาน',
                              });
                          }}
                          disabled={resolve.isPending}
                          className="btn-secondary btn-sm text-red-500"
                        >
                          <Trash2 size={12} /> ลบเนื้อหา
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            resolve.mutate({
                              id: r.id,
                              status: 'DISMISSED',
                              resolution: 'ไม่พบมูลเหตุ',
                            })
                          }
                          disabled={resolve.isPending}
                          className="btn-secondary btn-sm"
                        >
                          <XCircle size={12} /> ไม่มีมูลเหตุ
                        </button>
                      </div>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-ink-400">
                        <CheckCircle2 size={13} /> ปิดแล้ว
                      </span>
                    )}
                  </div>

                  {r.url && (
                    <a
                      href={r.url}
                      className="link mt-2 inline-block text-xs"
                      target="_blank"
                      rel="noreferrer"
                    >
                      เปิดเนื้อหา
                    </a>
                  )}
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
