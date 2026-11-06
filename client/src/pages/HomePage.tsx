import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Eye,
  Flame,
  Hash,
  LayoutGrid,
  Loader2,
  MessageSquare,
  PenSquare,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { api, qs } from '../lib/api';
import { CountUp, RiseIn, motion, riseChild, staggerParent } from '../components/anim';
import { Marquee } from '../components/Marquee';
import { useAuth } from '../lib/auth';
import { useSocketEvents } from '../lib/realtime';
import { useDebounced } from '../lib/hooks';
import { HeartIcon, PostCard } from '../components/PostCard';
import { Pagination } from '../components/Pagination';
import { Alert, Avatar, Badge, CardSkeleton, EmptyState } from '../components/ui';
import { formatNumber, timeAgo } from '../lib/format';
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
  // The hero rail previews the same query the feed shows, so it never needs an
  // extra request — and it reads as "what is happening right now".
  const latest = useMemo(() => posts.slice(0, 3), [posts]);

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
            className="relative grid gap-10 p-7 sm:p-11 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center"
            variants={staggerParent}
            initial="hidden"
            animate="show"
          >
            <div>
              <motion.span
                variants={riseChild}
                className="badge border border-brand-500/40 bg-brand-500/10 font-mono text-brand-400 glow-text"
              >
                <Sparkles size={11} />
                COMMUNITY PLATFORM
              </motion.span>

              <motion.h1
                variants={riseChild}
                className="mt-6 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-ink-900 sm:text-5xl lg:text-6xl"
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
            </div>

            {/* Live rail: fills the desktop hero and shows the feed is alive. */}
            <motion.aside variants={riseChild} className="hidden lg:block">
              <div className="rounded-2xl border border-ink-500/12 bg-surface-0/55 p-2 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md">
                <div className="flex items-center justify-between px-2.5 py-2">
                  <span className="eyebrow flex items-center gap-2 text-ink-500">
                    <span className="pulse-dot" />
                    กำลังเกิดขึ้น
                  </span>
                  <Link
                    to="/explore"
                    className="text-[11px] font-medium text-brand-400 underline-offset-4 hover:underline"
                  >
                    ดูทั้งหมด
                  </Link>
                </div>

                <ul className="space-y-0.5">
                  {latest.length === 0
                    ? Array.from({ length: 3 }, (_, i) => (
                        <li key={i} className="px-2.5 py-2.5">
                          <div className="skeleton h-3 w-4/5" />
                          <div className="skeleton mt-2 h-2.5 w-2/5" />
                        </li>
                      ))
                    : latest.map((post, index) => (
                        <li key={post.id}>
                          <Link
                            to={`/posts/${post.slug}`}
                            className="group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-surface-2"
                          >
                            <span className="mt-0.5 font-mono text-[10px] text-ink-400 transition group-hover:text-brand-400">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="min-w-0">
                              <span className="line-clamp-2 text-[13px] leading-snug font-medium text-ink-700 transition group-hover:text-ink-900">
                                {post.title}
                              </span>
                              <span className="mt-1 block truncate text-[11px] text-ink-400">
                                {post.author.displayName} · {timeAgo(post.publishedAt ?? post.createdAt)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                </ul>

                <div className="mt-1 flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2">
                  <span className="text-[11px] text-ink-400">ออนไลน์ตอนนี้</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-400">
                    <span className="pulse-dot scale-75" />
                    {formatNumber(overview?.onlineNow ?? onlineUsers.length)}
                  </span>
                </div>
              </div>
            </motion.aside>

            {overview && (
              <motion.dl
                variants={riseChild}
                className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-500/10 bg-ink-500/10 sm:grid-cols-4 lg:col-span-2"
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

      {/* -------- Marquee ticker -------- */}
      <Marquee
        speed={35}
        className="border-y border-ink-500/10 bg-surface-1 py-3"
      >
        <span className="inline-flex items-center font-mono text-sm leading-7 text-ink-400">
          <span className="text-ink-400">📢</span>
          <span className="text-ink-300">บทความใหม่</span>
          <span className="px-2 text-ink-500">•</span>
          <span className="text-brand-400">TypeScript ให้ปลอดภัยและอ่านง่าย</span>
          <span className="px-2 text-ink-500">•</span>
          <span className="text-ink-300">เร่งความเร็ว PostgreSQL ด้วย Index ที่ถูกจุด</span>
          <span className="px-2 text-ink-500">•</span>
          <span className="text-brand-400">เริ่มต้น Docker Compose สำหรับโปรเจกต์ขนาดกลาง</span>
          <span className="px-2 text-ink-500">•</span>
          <span className="text-ink-300">ออกแบบ REST API ที่ปลอดภัยและขยายได้</span>
          <span className="px-2 text-ink-500">•</span>
          <span className="text-brand-400">จัดการไฟล์แนบอย่างปลอดภัยในเว็บแอป</span>
          <span className="px-2 text-ink-500">•</span>
          <span className="text-ink-300">ทดสอบเว็บแอปอย่างมีประสิทธิภาพสำหรับทีมเล็ก</span>
          <span className="px-2 text-ink-500">•</span>
          <span className="text-brand-400">WKSL — แชร์ความรู้ สร้างสิ่งที่ดี</span>
        </span>
      </Marquee>

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
          <SectionHeading icon={<Flame size={14} className="text-warn" />} title="บทความแนะนำ" />
          <FeaturedPost post={featured[0]} onToggleLike={toggleLike} />
        </section>
      )}

      {/* -------- Feed -------- */}
      {/* With a single post the featured block already shows it, so an empty
          "latest" list would just be a stray heading above nothing. */}
      {(rest.length > 0 || featured.length === 0) && (
        <section>
          <SectionHeading
            title={hasFilters ? 'ผลการค้นหา' : 'บทความล่าสุด'}
            count={meta?.total}
            trailing={
              postsQuery.isFetching ? (
                <Loader2 size={14} className="animate-spin text-ink-400" />
              ) : undefined
            }
          />

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
      )}

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
  // A brand-new site has a fortnight of zeroes; an empty chart reads as broken.
  if (data.every((d) => d.posts + d.comments === 0)) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-ink-500/15 px-4 text-center text-xs text-ink-400">
        ยังไม่มีกิจกรรมในช่วง 14 วัน — เริ่มเขียนบทความแรกได้เลย
      </div>
    );
  }
  return (
    <div className="flex h-28 gap-1.5">
      {data.map((d) => {
        const total = d.posts + d.comments;
        const height = Math.max(4, Math.round((total / max) * 100));
        return (
          <div key={d.date} className="group flex h-full flex-1 flex-col items-center gap-1">
            {/* The track needs a definite height, otherwise the percentage bars
                collapse to nothing (which is how this chart used to render). */}
            <div className="flex w-full flex-1 items-end">
              <div
                className="relative w-full rounded-t bg-surface-2 transition group-hover:bg-brand-500/40"
                style={{ height: `${height}%` }}
                title={`${d.date}: ${d.posts} บทความ, ${d.comments} ความคิดเห็น`}
              >
                <span
                  className="absolute inset-x-0 bottom-0 rounded-t bg-brand-500/60"
                  style={{ height: `${(d.posts / Math.max(total, 1)) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-[9px] text-ink-400">{d.date.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  count,
  trailing,
}: {
  icon?: ReactNode;
  title: string;
  count?: number;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-500">
        {icon}
        {title}
        {typeof count === 'number' && (
          <span className="font-normal text-ink-400">({formatNumber(count)})</span>
        )}
      </h2>
      {trailing}
    </div>
  );
}

/**
 * The first post gets an editorial treatment: a split image/text card large
 * enough to carry the page, instead of another grid card. Falls back to a
 * single text column when the post has no cover.
 */
function FeaturedPost({
  post,
  onToggleLike,
}: {
  post: Post;
  onToggleLike: (post: Post) => void;
}) {
  const href = `/posts/${post.slug}`;

  return (
    <RiseIn className="card card-hover group overflow-hidden">
      <div className={clsx('grid', post.coverImage && 'lg:grid-cols-[1.05fr_1fr]')}>
        {post.coverImage && (
          <Link
            to={href}
            tabIndex={-1}
            aria-hidden
            className="relative block aspect-[16/9] overflow-hidden bg-surface-2 lg:aspect-auto lg:min-h-[340px]"
          >
            <img
              src={post.coverImage}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover grayscale-[30%] transition duration-700 group-hover:scale-[1.04] group-hover:grayscale-0"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-black/35" />
            <span className="badge absolute bottom-4 left-4 gap-1.5 border border-white/15 bg-black/55 text-white backdrop-blur">
              <Clock size={11} />
              {post.readMinutes} นาที
            </span>
          </Link>
        )}

        <div className="flex flex-col p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge gap-1.5 border border-brand-500/35 bg-brand-500/10 text-brand-400">
              <Flame size={11} /> แนะนำ
            </span>
            {post.category && (
              <Link to={`/?category=${post.category.slug}`}>
                <Badge color={post.category.color}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {post.category.name}
                </Badge>
              </Link>
            )}
          </div>

          <h3 className="mt-5 text-2xl leading-[1.2] font-semibold tracking-tight text-ink-900 sm:text-[28px]">
            <Link
              to={href}
              className="bg-gradient-to-r from-ink-900 to-ink-900 bg-[length:0_1px] bg-left-bottom bg-no-repeat transition group-hover:from-brand-400 group-hover:to-brand-400 group-hover:bg-[length:100%_1px]"
            >
              {post.title}
            </Link>
          </h3>

          {post.excerpt && (
            <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-ink-500">{post.excerpt}</p>
          )}

          <div className="mt-auto pt-6">
            <div className="rule mb-4" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-400">
              <Link
                to={`/u/${post.author.username}`}
                className="flex items-center gap-2 transition hover:text-brand-400"
              >
                <Avatar name={post.author.displayName} src={post.author.avatarUrl} size="sm" />
                <span className="font-medium text-ink-900">{post.author.displayName}</span>
              </Link>
              <span>·</span>
              <span>{timeAgo(post.publishedAt ?? post.createdAt)}</span>

              <span className="ml-auto flex items-center gap-1">
                <Eye size={13} /> {formatNumber(post.viewCount)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare size={13} /> {formatNumber(post.commentCount)}
              </span>
              <motion.button
                type="button"
                onClick={() => onToggleLike(post)}
                aria-pressed={post.likedByMe}
                aria-label={post.likedByMe ? 'เอาถูกใจออก' : 'ถูกใจ'}
                whileTap={{ scale: 0.85 }}
                className={clsx(
                  'flex items-center gap-1 rounded-lg px-1.5 py-1 transition',
                  post.likedByMe ? 'text-brand-400' : 'hover:text-ink-700',
                )}
              >
                <HeartIcon filled={post.likedByMe} />
                {formatNumber(post.likeCount)}
              </motion.button>
            </div>

            <Link to={href} className="btn-primary btn-sm mt-5 w-fit">
              อ่านบทความ
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </RiseIn>
  );
}