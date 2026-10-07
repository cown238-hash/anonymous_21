import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Flame,
  Hash,
  LayoutGrid,
  Loader2,
  PenSquare,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { api, qs } from '../lib/api';
import { CountUp, motion, riseChild, staggerParent } from '../components/anim';
import { useAuth } from '../lib/auth';
import { useSocketEvents } from '../lib/realtime';
import { useDebounced } from '../lib/hooks';
import { PostCard } from '../components/PostCard';
import { Pagination } from '../components/Pagination';
import { Alert, Avatar, CardSkeleton, EmptyState } from '../components/ui';
import { formatNumber } from '../lib/format';
import { useSeo } from '../lib/seo';
import type { Category, Overview, Paginated, Post, Tag } from '../types';

type SortKey = 'newest' | 'oldest' | 'popular' | 'trending';

const SORTS: Array<{ key: SortKey; label: string; icon: typeof TrendingUp }> = [
  { key: 'newest', label: 'ใหม่สุด', icon: Sparkles },
  { key: 'trending', label: 'กำลังมาแรง', icon: Flame },
  { key: 'popular', label: 'ยอดเข้าชมสูงสุด', icon: TrendingUp },
  { key: 'oldest', label: 'เก่าสุด', icon: LayoutGrid },
];

export function HomePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { onlineUsers } = useSocketEvents();
  const [params, setParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(searchInput, 400);

  const page = Number(params.get('page') ?? '1');
  const sort = (params.get('sort') as SortKey) ?? 'newest';
  const category = params.get('category') ?? '';
  const tag = params.get('tag') ?? '';
  const q = params.get('q') ?? '';

  const patchParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in patch)) next.set('page', '1');
    setParams(next, { replace: true });
  };

  // Keep the input in sync when navigating via the URL.
  useEffect(() => {
    setSearchInput(params.get('q') ?? '');
  }, [params]);

  useEffect(() => {
    const currentQ = params.get('q') ?? '';
    if (debouncedSearch !== currentQ) {
      const next = new URLSearchParams(params);
      if (debouncedSearch) next.set('q', debouncedSearch);
      else next.delete('q');
      next.set('page', '1');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data: overview } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => api.get<Overview>('/stats/overview'),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
    staleTime: 5 * 60_000,
  });

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get<Tag[]>('/tags'),
    staleTime: 5 * 60_000,
  });

  const postsQuery = useQuery({
    queryKey: ['posts', { page, sort, category, tag, q }],
    queryFn: () =>
      api.get<Paginated<Post>>(
        `/posts${qs({ page, perPage: 12, sort, category, tag, q })}`,
      ),
  });

  const likeMutation = useMutation({
    mutationFn: ({ postId }: { postId: string }) =>
      api.post<{ liked: boolean; likeCount: number }>(`/posts/${postId}/like`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post'] });
    },
  });

  const activeCategory = categories?.find((c) => c.slug === category);
  const posts = postsQuery.data?.items ?? [];
  const meta = postsQuery.data?.meta;
  const hasFilters = Boolean(q || category || tag);

  useSeo({
    title: activeCategory
      ? `บทความในหมวด ${activeCategory.name}`
      : q
        ? `ค้นหา “${q}”`
        : hasFilters
          ? 'ผลการค้นหา'
          : 'หน้าแรก',
    description: activeCategory
      ? `${activeCategory.description ?? 'บทความในหมวดหมู่นี้'} — อ่านฟรีบน WKSL`
      : 'บทความล่าสุดจากชุมชน WKSL เรื่องเทคโนโลยี การออกแบบ ผลิตภัณฑ์ และข้อมูล',
    path: '/',
  });

  const featured = useMemo(
    () => (posts.length > 0 && sort === 'newest' && !hasFilters ? posts.slice(0, 1) : []),
    [posts, sort, hasFilters],
  );
  const rest = useMemo(() => (featured.length ? posts.slice(1) : posts), [posts, featured]);

  const toggleLike = (post: Post) => {
    if (!user) return;
    likeMutation.mutate({ postId: post.id });
  };

  return (
    <div className="space-y-6">
      {/* -------- Hero -------- */}
      {!hasFilters && !q && (
        <section className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-surface-1 shadow-[0_0_60px_-20px_color-mix(in_oklab,var(--color-brand-500)_45%,transparent)]">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(70%_90%_at_85%_0%,color-mix(in_oklab,var(--color-brand-500)_28%,transparent),transparent)]" />
          <div
            aria-hidden
            className="animate-drift-a pointer-events-none absolute -top-24 right-[8%] h-72 w-72 rounded-full bg-brand-500/45 blur-3xl"
          />
          <div
            aria-hidden
            className="animate-drift-b pointer-events-none absolute -bottom-28 left-[4%] h-80 w-80 rounded-full bg-accent-500/30 blur-3xl"
          />
          <div
            aria-hidden
            className="animate-drift-b pointer-events-none absolute top-1/3 left-1/2 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl"
            style={{ animationDelay: '-6s' }}
          />

          <motion.div
            className="relative p-7 sm:p-11"
            variants={staggerParent}
            initial="hidden"
            animate="show"
          >
            <motion.span
              variants={riseChild}
              className="badge border border-brand-500/40 bg-brand-500/10 font-mono text-brand-400 glow-text"
            >
              <Sparkles size={11} />
              COMMUNITY PLATFORM
            </motion.span>

            <motion.h1
              variants={riseChild}
              className="mt-6 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-ink-900 sm:text-6xl"
            >
              แชร์ความรู้
              <br />
              <span className="text-gradient-flow animate-gradient-flow">สร้างสิ่งที่ดี</span>
            </motion.h1>

            <motion.p
              variants={riseChild}
              className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-500"
            >
              เขียนบทความ อัปโหลดรูป แชทแบบเรียลไทม์
              และติดตามสิ่งที่เกิดขึ้นบนชุมชนได้ในที่เดียว
            </motion.p>

            <motion.div variants={riseChild} className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={user ? '/posts/new' : '/register'} className="btn-primary">
                <PenSquare size={16} />
                {user ? 'เขียนบทความแรก' : 'เริ่มเขียนบอกเลย'}
              </Link>
              <Link to="/explore" className="btn-secondary">
                สำรวจเนื้อหา
                <ArrowUpRight size={15} />
              </Link>
            </motion.div>

            {overview && (
              <motion.dl
                variants={riseChild}
                className="mt-11 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-500/10 bg-ink-500/10 sm:grid-cols-4"
              >
                {[
                  { label: 'บทความ', value: overview.totals.posts },
                  { label: 'สมาชิก', value: overview.totals.users },
                  { label: 'ความคิดเห็น', value: overview.totals.comments },
                  { label: 'ออนไลน์', value: overview.onlineNow },
                ].map((stat) => (
                  <div key={stat.label} className="bg-surface-1 px-5 py-5">
                    <dt className="eyebrow">{stat.label}</dt>
                    <dd className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-900">
                      <CountUp value={stat.value} />
                    </dd>
                  </div>
                ))}
              </motion.dl>
            )}
          </motion.div>
        </section>
      )}

      {/* -------- Toolbar -------- */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ค้นหาบทความจากชื่อ เนื้อหา หรือคำอธิบาย…"
              className="input pl-10"
              aria-label="ค้นหาบทความ"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-400 hover:text-ink-900"
                aria-label="ล้างคำค้น"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="eyebrow hidden shrink-0 sm:inline">เรียง</span>
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => patchParams({ sort: s.key === 'newest' ? null : s.key })}
                className={clsx(
                  'btn-sm shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  sort === s.key
                    ? 'bg-brand-500 font-semibold text-black'
                    : 'border border-ink-500/12 text-ink-500 hover:bg-surface-2 hover:text-ink-900',
                )}
              >
                <s.icon size={12} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category chips */}
        {categories && categories.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-500/10 pt-4">
            <button
              type="button"
              onClick={() => patchParams({ category: null })}
              className={clsx(
                'badge transition',
                !category ? 'bg-brand-500 font-semibold text-black' : 'bg-surface-2 text-ink-500 hover:text-ink-900',
              )}
            >
              ทั้งหมด
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => patchParams({ category: category === c.slug ? null : c.slug })}
                className="badge transition"
                style={
                  category === c.slug
                    ? { backgroundColor: 'var(--color-brand-500)', color: '#000' }
                    : { backgroundColor: `${c.color}1a`, color: c.color }
                }
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {c.name}
                <span className="opacity-60">{c.postCount ?? 0}</span>
              </button>
            ))}
          </div>
        )}

        {(hasFilters || activeCategory) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-400">ตัวกรอง:</span>
            {q && <FilterChip label={`ค้นหา “${q}”`} onClear={() => patchParams({ q: null })} />}
            {activeCategory && (
              <FilterChip
                label={activeCategory.name}
                onClear={() => patchParams({ category: null })}
              />
            )}
            {tag && <FilterChip label={`#${tag}`} onClear={() => patchParams({ tag: null })} />}
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="link ml-1"
            >
              ล้างทั้งหมด
            </button>
          </div>
        )}
      </div>

      {/* -------- Featured -------- */}
      {featured.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-500">
            <Flame size={14} className="text-warn" /> บทความแนะนำ
          </h2>
          <PostCard post={featured[0]} onToggleLike={toggleLike} />
        </section>
      )}

      {/* -------- Feed -------- */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-500">
            {hasFilters ? 'ผลการค้นหา' : 'บทความล่าสุด'}
            {meta && <span className="ml-2 text-ink-400">({formatNumber(meta.total)})</span>}
          </h2>
          {postsQuery.isFetching && <Loader2 size={14} className="animate-spin text-ink-400" />}
        </div>

        {postsQuery.isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : postsQuery.isError ? (
          <Alert>{(postsQuery.error as Error).message}</Alert>
        ) : rest.length === 0 && featured.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Search size={34} />}
              title={q ? `ไม่พบผลลัพธ์สำหรับ “${q}”` : 'ยังไม่มีบทความในหมวดนี้'}
              description={
                q
                  ? 'ลองใช้คำค้นที่สั้นลง หรือเลือกหมวดหมู่อื่น'
                  : 'เป็นคนแรกที่แชร์เนื้อหาในหมวดนี้ได้เลย'
              }
              action={
                <Link to={user ? '/posts/new' : '/register'} className="btn-primary">
                  <PenSquare size={15} /> เขียนบทความ
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {rest.map((post) => (
                <PostCard key={post.id} post={post} onToggleLike={toggleLike} />
              ))}
            </div>

            {meta && meta.totalPages > 1 && (
              <Pagination
                className="mt-8"
                page={meta.page}
                totalPages={meta.totalPages}
                onChange={(p) => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(p));
                  setParams(next);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
          </>
        )}
      </section>

      {/* -------- Sidebar widgets -------- */}
      {!hasFilters && (
        <div className="grid gap-5 pt-2 lg:grid-cols-2">
          {tags && tags.length > 0 && (
            <section className="card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Hash size={15} className="text-brand-500" /> แท็กยอดนิยม
              </h3>
              <div className="flex flex-wrap gap-2">
                {tags.slice(0, 16).map((t) => (
                  <Link
                    key={t.id}
                    to={`/?tag=${t.slug}`}
                    className={`badge transition ${
                      tag === t.slug
                        ? 'bg-brand-500 font-semibold text-black'
                        : 'bg-surface-2 text-ink-500 hover:bg-brand-500/10 hover:text-brand-400'
                    }`}
                  >
                    #{t.name}
                    <span className="opacity-60">{t.postCount}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {overview && (
            <section className="card p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Activity size={15} className="text-brand-400" /> กิจกรรม 14 วันล่าสุด
              </h3>
              <ActivityChart data={overview.activity} />
            </section>
          )}
        </div>
      )}

      {/* Online roster */}
      {onlineUsers.length > 0 && !hasFilters && (
        <section className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            ออนไลน์ ({onlineUsers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {onlineUsers.slice(0, 14).map((u) => (
              <Link
                key={u.id}
                to={u.username ? `/u/${u.username}` : '#'}
                className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pr-3 pl-1.5 transition hover:bg-brand-500/10"
              >
                <Avatar name={u.displayName ?? 'ผู้ใช้'} src={u.avatarUrl ?? null} size="xs" online />
                <span className="text-xs font-medium">{u.displayName ?? 'ผู้ใช้'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="badge bg-brand-500/10 text-brand-400 dark:text-brand-400">
      {label}
      <button type="button" onClick={onClear} aria-label={`ลบตัวกรอง ${label}`}>
        <X size={12} />
      </button>
    </span>
  );
}

function ActivityChart({ data }: { data: Overview['activity'] }) {
  const max = Math.max(1, ...data.map((d) => d.posts + d.comments));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((d) => {
        const total = d.posts + d.comments;
        const height = Math.round((total / max) * 100);
        return (
          <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
            <div
              className="relative w-full rounded-t bg-surface-2 transition group-hover:bg-brand-500/40"
              style={{ height: `${Math.max(height, 4)}%` }}
              title={`${d.date}: ${d.posts} บทความ, ${d.comments} ความคิดเห็น`}
            >
              <span className="absolute inset-x-0 bottom-0 rounded-t bg-brand-500/60" style={{ height: `${(d.posts / Math.max(total, 1)) * 100}%` }} />
            </div>
            <span className="text-[9px] text-ink-400">{d.date.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}