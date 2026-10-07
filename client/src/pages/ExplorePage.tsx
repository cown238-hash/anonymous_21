import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, Compass, Hash, TrendingUp, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { useSeo } from '../lib/seo';
import { Avatar, Badge, CardSkeleton, EmptyState } from '../components/ui';
import { PostCard } from '../components/PostCard';
import type { Category, Overview, Post, Tag, User } from '../types';

interface Contributor extends User {
  posts: number;
  comments: number;
  likesGiven: number;
  score: number;
}

export function ExplorePage() {
  const [limit, setLimit] = useState(9);

  useSeo({
    title: 'สำรวจ',
    description: 'บทความที่กำลังมาแรง หมวดหมู่ยอดนิยม แท็กที่ใช้บ่อย และอันดับผู้มีส่วนร่วมในชุมชน WKSL',
    path: '/explore',
  });

  const overview = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => api.get<Overview>('/stats/overview'),
  });

  const trending = useQuery({
    queryKey: ['posts', 'trending'],
    queryFn: () => api.get<{ items: Post[] }>('/posts?sort=trending&perPage=9'),
  });

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get<Tag[]>('/tags'),
  });

  const contributors = useQuery({
    queryKey: ['stats', 'contributors'],
    queryFn: () => api.get<Contributor[]>('/stats/contributors'),
  });

  return (
    <div className="space-y-7">
      <header className="relative overflow-hidden rounded-3xl border border-ink-500/10 bg-surface-1 p-6 sm:p-8">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_100%_at_85%_0%,color-mix(in_oklab,var(--color-brand-500)_20%,transparent),transparent)]" />
        <div className="relative">
          <span className="badge border border-brand-500/30 bg-brand-500/10 text-brand-400">
            <Compass size={11} /> สำรวจ
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            ค้นพบสิ่งที่น่าสนใจ
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-500">
            บทความที่กำลังมาแรง หมวดหมู่ยอดนิยม และผู้คนที่ช่วยเติมเต็มชุมชนของเรา
          </p>

          {overview.data && (
            <div className="mt-6 flex flex-wrap gap-6">
              {[
                ['บทความทั้งหมด', overview.data.totals.posts],
                ['สมาชิก', overview.data.totals.users],
                ['ออนไลน์', overview.data.onlineNow],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-xs text-ink-400">{label}</p>
                  <p className="text-xl font-bold">{Number(value).toLocaleString('th-TH')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Categories */}
      {categories.data && categories.data.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-500">
            <Award size={15} className="text-brand-500" /> หมวดหมู่ทั้งหมด
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.data.map((c) => (
              <Link
                key={c.id}
                to={`/?category=${c.slug}`}
                className="card card-hover flex items-center gap-3.5 p-4"
              >
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold"
                  style={{ backgroundColor: `${c.color}1f`, color: c.color }}
                >
                  {c.name[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-ink-400">
                    {c.description ?? `${c.postCount ?? 0} บทความ`}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-400">{c.postCount ?? 0}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Trending posts */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-500">
            <TrendingUp size={15} className="text-warn" /> กำลังมาแรง
          </h2>
          <button
            type="button"
            onClick={() => setLimit((l) => (l === 9 ? 6 : 9))}
            className="btn-ghost btn-sm"
          >
            {limit === 9 ? 'แสดงน้อยลง' : 'แสดงเพิ่ม'}
          </button>
        </div>

        {trending.isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : !trending.data?.items.length ? (
          <div className="card">
            <EmptyState title="ยังไม่มีบทความยอดนิยม" />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {trending.data.items.slice(0, limit).map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tags */}
        {tags.data && tags.data.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Hash size={15} className="text-accent-400" /> แท็กที่ใช้บ่อย
            </h2>
            <div className="flex flex-wrap gap-2">
              {tags.data.map((t) => (
                <Link
                  key={t.id}
                  to={`/?tag=${t.slug}`}
                  className="badge bg-surface-2 text-ink-500 transition hover:bg-brand-500/10 hover:text-brand-400 dark:hover:text-brand-400"
                >
                  #{t.name}
                  <span className="opacity-50">{t.postCount}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Leaderboard */}
        {contributors.data && contributors.data.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Trophy size={15} className="text-warn" /> ผู้มีส่วนร่วมมากที่สุด
            </h2>
            <ol className="space-y-1">
              {contributors.data.map((c, i) => (
                <li key={c.id}>
                  <Link
                    to={`/u/${c.username}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2"
                  >
                    <span
                      className={`w-5 text-center text-xs font-bold ${
                        i === 0
                          ? 'text-warn'
                          : i === 1
                            ? 'text-ink-400'
                            : i === 2
                              ? 'text-warn'
                              : 'text-ink-400'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <Avatar name={c.displayName} src={c.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.displayName}</span>
                      <span className="block text-[11px] text-ink-400">
                        {c.posts} บทความ · {c.comments} ความคิดเห็น
                      </span>
                    </span>
                    {c.role === 'ADMIN' && (
                      <Badge className="bg-brand-500/12 text-brand-400 dark:text-brand-400">แอดมิน</Badge>
                    )}
                    <span className="shrink-0 text-xs font-semibold text-ink-500">{c.score}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}