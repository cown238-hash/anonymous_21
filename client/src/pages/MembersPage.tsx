import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquarePlus, Search, Users } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced } from '../lib/hooks';
import { formatNumber } from '../lib/format';
import { useSeo } from '../lib/seo';
import { Alert, Avatar, EmptyState, SkeletonList } from '../components/ui';
import { Pagination } from '../components/Pagination';
import type { DirectoryUser, Paginated } from '../types';

type SortKey = 'newest' | 'posts' | 'followers';

export function MembersPage() {
  const { user: me, isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search, 350);

  useSeo({
    title: debounced ? `ค้นหาสมาชิก “${debounced}”` : 'สมาชิก',
    description: 'สำรวจสมาชิกในชุมชน WKSL — ผู้เขียนบทความและผู้พูดคุยที่กำลังออนไลน์อยู่',
    path: '/members',
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['users', debounced, sort, page],
    queryFn: () => api.get<Paginated<DirectoryUser>>(`/users${qs({ q: debounced, sort, page, perPage: 12 })}`),
  });

  const sortLabels: Record<SortKey, string> = {
    newest: 'เพิ่งเข้าร่วม',
    posts: 'เขียนบทความมากที่สุด',
    followers: 'สมาชิกรุ่นแรก',
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Users size={20} className="text-brand-500" /> สมาชิก
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          พบกับคนที่สร้างเนื้อหาและพูดคุยในชุมชน WKSL
        </p>
      </header>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาชื่อหรือชื่อผู้ใช้…"
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(Object.keys(sortLabels) as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSort(key);
                setPage(1);
              }}
              className={`btn-sm shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                sort === key
                  ? 'bg-brand-500 font-semibold text-black'
                  : 'border border-ink-500/15 text-ink-500 hover:bg-surface-2'
              }`}
            >
              {sortLabels[key]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <SkeletonList count={4} />
      ) : isError ? (
        <Alert>{(error as Error).message}</Alert>
      ) : !data?.items.length ? (
        <div className="card">
          <EmptyState
            icon={<Users size={32} />}
            title="ไม่พบสมาชิกที่ค้นหา"
            description={search ? `ไม่มีผลลัพธ์สำหรับ “${search}”` : 'ยังไม่มีสมาชิกในระบบ'}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((u) => (
              <div key={u.id} className="card card-hover flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <Link to={`/u/${u.username}`}>
                    <Avatar name={u.displayName} src={u.avatarUrl} size="lg" online={u.isOnline} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/u/${u.username}`} className="block">
                      <span className="block truncate font-semibold hover:underline">
                        {u.displayName}
                      </span>
                      <span className="block truncate text-xs text-ink-400">@{u.username}</span>
                    </Link>
                    {u.role === 'ADMIN' && (
                      <span className="badge mt-1.5 bg-brand-500/12 text-brand-400 dark:text-brand-400">
                        ผู้ดูแลระบบ
                      </span>
                    )}
                    {isAdmin && u.isHidden && (
                      <span className="badge mt-1.5 border border-warn/30 bg-warn/10 text-warn">
                        ซ่อนโปรไฟล์อยู่
                      </span>
                    )}
                  </div>
                </div>

                {u.bio && <p className="mt-3 line-clamp-2 text-sm text-ink-500">{u.bio}</p>}

                <div className="mt-4 flex items-center gap-4 border-t border-ink-500/10 pt-3 text-xs text-ink-400">
                  <span>{formatNumber(u.stats.posts)} บทความ</span>
                  <span>{formatNumber(u.stats.comments)} ความคิดเห็น</span>
                  {me && me.id !== u.id && (
                    <Link
                      to={`/chat?u=${u.id}`}
                      className="btn-ghost btn-sm ml-auto h-7 w-7 p-0"
                      title="ส่งข้อความ"
                    >
                      <MessageSquarePlus size={14} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.meta.totalPages > 1 && (
            <Pagination
              className="mt-8"
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}