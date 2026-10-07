import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, Eye, MessageSquare } from 'lucide-react';
import type { Post } from '../types';
import { timeAgo, formatNumber } from '../lib/format';
import { Avatar, Badge, StatusBadge } from './ui';
import { AttachmentBadge } from './Attachments';
import { RiseIn, motion } from './anim';

interface PostCardProps {
  post: Post;
  onToggleLike?: (post: Post) => void;
  onDelete?: (post: Post) => void;
  onEdit?: (post: Post) => void;
  showStatus?: boolean;
  compact?: boolean;
}

export function PostCard({
  post,
  onToggleLike,
  onDelete,
  onEdit,
  showStatus,
  compact,
}: PostCardProps) {
  const href = `/posts/${post.slug}`;

  return (
    <RiseIn className="card card-hover group flex flex-col overflow-hidden">
      {post.coverImage && !compact && (
        <Link to={href} className="block aspect-[16/9] overflow-hidden bg-surface-2">
          <img
            src={post.coverImage}
            alt={post.title}
            loading="lazy"
            className="h-full w-full object-cover grayscale-[35%] transition duration-500 group-hover:scale-[1.03] group-hover:grayscale-0"
          />
        </Link>
      )}

      <div className="flex flex-1 flex-col p-5">
        {(post.featured || showStatus || post.category) && (
          <div className="mb-3.5 flex flex-wrap items-center gap-2">
            {post.featured && (
              <span className="badge border border-brand-500/30 bg-brand-500/10 text-brand-400">แนะนำ</span>
            )}
            {showStatus && <StatusBadge status={post.status} />}
            {post.category && (
              <Link to={`/?category=${post.category.slug}`}>
                <Badge color={post.category.color}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {post.category.name}
                </Badge>
              </Link>
            )}
          </div>
        )}

        <h3 className="text-lg leading-snug font-semibold tracking-tight text-ink-900">
          <Link
            to={href}
            className="bg-gradient-to-r from-ink-900 to-ink-900 bg-[length:0_1px] bg-left-bottom bg-no-repeat transition group-hover:from-brand-400 group-hover:to-brand-400 group-hover:bg-[length:100%_1px]"
          >
            {post.title}
          </Link>
        </h3>

        {post.excerpt && (
          <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-ink-500">{post.excerpt}</p>
        )}

        {post.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 4).map((tag) => (
              <Link
                key={tag.id}
                to={`/?tag=${tag.slug}`}
                className="badge border border-ink-500/12 font-mono text-ink-400 transition hover:border-brand-500/30 hover:text-brand-400"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-auto pt-5">
          <div className="rule mb-4" />
          <div className="flex items-center gap-2.5">
            <Link to={`/u/${post.author.username}`} className="flex min-w-0 items-center gap-2.5">
              <Avatar name={post.author.displayName} src={post.author.avatarUrl} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-900">
                  {post.author.displayName}
                </span>
                <span className="block text-xs text-ink-400">
                  {timeAgo(post.publishedAt ?? post.createdAt)}
                </span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-0.5 text-ink-400">
              <span className="hidden items-center gap-1 px-1.5 text-xs sm:flex">
                <Clock size={12} />
                {post.readMinutes}น.
              </span>
              <AttachmentBadge count={post.attachmentCount ?? 0} />
              <Link
                to={href}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition hover:bg-surface-2 hover:text-ink-900"
                aria-label={`${post.viewCount} ครั้งที่เข้าชม`}
              >
                <Eye size={13} />
                {formatNumber(post.viewCount)}
              </Link>
              <Link
                to={`${href}#comments`}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition hover:bg-surface-2 hover:text-ink-900"
                aria-label={`${post.commentCount} ความคิดเห็น`}
              >
                <MessageSquare size={13} />
                {formatNumber(post.commentCount)}
              </Link>
              {onToggleLike && (
                <motion.button
                  type="button"
                  onClick={() => onToggleLike(post)}
                  aria-pressed={post.likedByMe}
                  aria-label={post.likedByMe ? 'เอาถูกใจออก' : 'ถูกใจ'}
                  whileTap={{ scale: 0.82 }}
                  className={clsx(
                    'flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition active:scale-90',
                    post.likedByMe
                      ? 'bg-brand-500/12 text-brand-400'
                      : 'hover:bg-surface-2 hover:text-ink-700',
                  )}
                >
                  <motion.span
                    key={String(post.likedByMe)}
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                    className="flex"
                  >
                    <HeartIcon filled={post.likedByMe} />
                  </motion.span>
                  {formatNumber(post.likeCount)}
                </motion.button>
              )}
            </div>
          </div>

          {(onEdit || onDelete) && (
            <div className="mt-3 flex gap-2 border-t border-ink-500/10 pt-3">
              {onEdit && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => onEdit(post)}>
                  แก้ไข
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="btn-ghost btn-sm text-danger hover:bg-danger/10"
                  onClick={() => onDelete(post)}
                >
                  ลบ
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </RiseIn>
  );
}

export function HeartIcon({ filled, size = 13 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx('transition', filled && 'scale-110')}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function PostListRow({ post }: { post: Post }) {
  return (
    <Link
      to={`/posts/${post.slug}`}
      className="group flex items-center gap-4 rounded-xl p-3 transition hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900 transition group-hover:text-brand-400">
          {post.title}
        </p>
        <p className="mt-0.5 text-xs text-ink-400">
          {post.author.displayName} · {timeAgo(post.publishedAt ?? post.createdAt)}
        </p>
      </div>
      <ArrowUpRight size={15} className="shrink-0 text-ink-400 transition group-hover:text-brand-400" />
    </Link>
  );
}