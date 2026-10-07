import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CornerUpLeft, Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { timeAgo } from '../lib/format';
import { Alert, Avatar, EmptyState, SkeletonList } from './ui';
import { ReportButton } from './ReportButton';
import type { Comment, Paginated } from '../types';

export function CommentSection({ postId }: { postId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['comments', postId, sort],
    queryFn: () => api.get<Paginated<Comment>>(`/posts/${postId}/comments${qs({ sort, perPage: 50 })}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    queryClient.invalidateQueries({ queryKey: ['post', postId] });
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: { content: string; parentId: string | null }) =>
      api.post<Comment>(`/posts/${postId}/comments`, payload),
    onSuccess: () => {
      setContent('');
      setReplyTo(null);
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => api.delete(`/posts/${postId}/comments/${commentId}`),
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    if (!user) {
      toast.info('กรุณาเข้าสู่ระบบเพื่อแสดงความคิดเห็น');
      return;
    }
    createMutation.mutate({ content: text, parentId: replyTo?.id ?? null });
  };

  const total = data?.meta.total ?? 0;

  return (
    <section id="comments" className="card scroll-mt-24 p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MessageSquare size={17} className="text-brand-500" />
          ความคิดเห็น
          <span className="text-sm font-normal text-ink-400">({total})</span>
        </h2>
        {total > 1 && (
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
            {(['newest', 'oldest'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  sort === s ? 'bg-surface-1 text-ink-900 shadow-sm' : 'text-ink-500'
                }`}
              >
                {s === 'newest' ? 'ใหม่สุด' : 'เก่าสุด'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      {user ? (
        <form onSubmit={submit} className="mb-6">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-brand-500/8 px-3 py-2 text-xs text-brand-400 dark:text-brand-400">
              <CornerUpLeft size={12} />
              ตอบกลับ <strong>{replyTo.author.displayName}</strong>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="ml-auto text-ink-400 hover:text-ink-700"
              >
                ยกเลิก
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <Avatar name={user.displayName} src={user.avatarUrl} size="sm" className="mt-1" />
            <div className="flex-1">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="แสดงความคิดเห็นของคุณ…"
                rows={3}
                maxLength={4000}
                className="input resize-y"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-ink-400">{content.length}/4000</span>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !content.trim()}
                  className="btn-primary btn-sm"
                >
                  {createMutation.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  ส่งความคิดเห็น
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <Alert className="mb-6">
          <Link to="/login" className="link font-medium">
            เข้าสู่ระบบ
          </Link>{' '}
          เพื่อแสดงความคิดเห็น
        </Alert>
      )}

      {/* List */}
      {isLoading ? (
        <SkeletonList count={2} />
      ) : isError ? (
        <Alert>{(error as Error).message}</Alert>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={30} />}
          title="ยังไม่มีความคิดเห็น"
          description="เริ่มต้นการสนทนาด้วยความคิดเห็นแรกเลย"
        />
      ) : (
        <ul className="space-y-5">
          {data.items.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              canReply={Boolean(user)}
              isAdmin={user?.role === 'ADMIN'}
              onReply={setReplyTo}
              onDelete={(id) => deleteMutation.mutate(id)}
              deleting={deleteMutation.isPending && deleteMutation.variables === comment.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  canReply,
  isAdmin,
  onReply,
  onDelete,
  deleting,
}: {
  comment: Comment;
  canReply: boolean;
  isAdmin: boolean;
  onReply: (c: Comment) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const canDelete = comment.canEdit || isAdmin;

  return (
    <li className="flex gap-3">
      <Avatar name={comment.author.displayName} src={comment.author.avatarUrl} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link to={`/u/${comment.author.username}`} className="text-sm font-semibold hover:underline">
            {comment.author.displayName}
          </Link>
          <span className="text-xs text-ink-400">@{comment.author.username}</span>
          <span className="text-xs text-ink-400">· {timeAgo(comment.createdAt)}</span>
        </div>

        <p className={`mt-1 text-sm leading-relaxed ${comment.isDeleted ? 'italic text-ink-400' : 'text-ink-700'}`}>
          {comment.content}
        </p>

        {!comment.isDeleted && (
          <div className="mt-1.5 flex items-center gap-3">
            {canReply && (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="flex items-center gap-1 text-xs text-ink-400 transition hover:text-brand-400"
              >
                <CornerUpLeft size={11} /> ตอบกลับ
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                disabled={deleting}
                className="flex items-center gap-1 text-xs text-ink-400 transition hover:text-red-500"
              >
                <Trash2 size={11} /> ลบ
              </button>
            )}
            <ReportButton
              targetType="comment"
              targetId={comment.id}
              label="รายงาน"
              className="flex items-center gap-1 px-0 py-0 text-xs text-ink-400 transition hover:text-warn"
            />
          </div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <ul className="mt-3 space-y-3 border-l-2 border-ink-500/10 pl-4">
            {comment.replies.map((reply) => (
              <li key={reply.id} className="flex gap-2.5">
                <Avatar
                  name={reply.author.displayName}
                  src={reply.author.avatarUrl}
                  size="xs"
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <Link
                      to={`/u/${reply.author.username}`}
                      className="text-xs font-semibold hover:underline"
                    >
                      {reply.author.displayName}
                    </Link>
                    <span className="text-[11px] text-ink-400">{timeAgo(reply.createdAt)}</span>
                  </div>
                  <p
                    className={`mt-0.5 text-sm leading-relaxed ${reply.isDeleted ? 'italic text-ink-400' : 'text-ink-700'}`}
                  >
                    {reply.content}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}