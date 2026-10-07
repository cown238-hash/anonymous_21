import { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { PostCard } from '../components/PostCard';
import { EmptyState } from '../components/ui';
import type { Post } from '../types';

const STORAGE_KEY = 'nimbus.bookmarks';

/**
 * Bookmarks live in localStorage on purpose - they are a private reading list
 * and should not require a round trip to the server.
 */
function readBookmarks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeBookmarks(ids: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function isBookmarked(postId: string): boolean {
  return readBookmarks().includes(postId);
}

export function toggleBookmark(postId: string): boolean {
  const ids = readBookmarks();
  const index = ids.indexOf(postId);
  if (index >= 0) ids.splice(index, 1);
  else ids.unshift(postId);
  writeBookmarks(ids);
  return index < 0;
}

export function BookmarksPage() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(readBookmarks());
  }, []);

  const { data: posts, isLoading } = useBookmarkedPosts(ids);

  const remove = (id: string) => {
    toggleBookmark(id);
    setIds(readBookmarks());
    toast.info('ลบออกจากรายการที่บันทึกไว้แล้ว');
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <BookmarkCheck size={20} className="text-brand-500" /> บันทึกไว้
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            รายการอ่านส่วนตัวของคุณ ({ids.length} รายการ) — เก็บไว้ในเครื่องนี้
          </p>
        </div>
        {ids.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm('ล้างรายการที่บันทึกไว้ทั้งหมด?')) {
                writeBookmarks([]);
                setIds([]);
                toast.success('ล้างรายการแล้ว');
              }
            }}
            className="btn-secondary btn-sm text-red-500"
          >
            <Trash2 size={13} /> ล้างทั้งหมด
          </button>
        )}
      </header>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton h-56" />
          ))}
        </div>
      ) : !posts?.length ? (
        <div className="card">
          <EmptyState
            icon={<Bookmark size={32} />}
            title="ยังไม่มีบทความที่บันทึกไว้"
            description="กดไอคอนดามสีชมพูที่มุมขวาล่างของบทความเพื่อเก็บไว้อ่านภายหลัง"
          />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <div key={post.id} className="relative">
              <PostCard post={post} compact />
              <button
                type="button"
                onClick={() => remove(post.id)}
                className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-lg bg-surface-1/90 text-ink-400 backdrop-blur transition hover:text-red-500"
                title="ลบออกจากรายการ"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fetches the bookmarked posts one by one (they are stored client-side). */
function useBookmarkedPosts(ids: string[]) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ids.length === 0) {
      setPosts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all(
      ids.map((id) =>
        api
          .get<{ post: Post }>(`/posts/${id}`)
          .then((r) => r.post)
          .catch(() => null),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        setPosts(results.filter((p): p is Post => p !== null));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ids.join(',')]);

  return { data: posts, isLoading: loading };
}