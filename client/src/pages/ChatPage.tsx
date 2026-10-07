import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Hash,
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
  Search,
  Send,
  Smile,
  Users as UsersIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocketEvents } from '../lib/realtime';
import { getSocket } from '../lib/socket';
import type { MessageEvent } from '../lib/socket';
import { toast } from '../lib/toast';
import { formatTime, timeAgo } from '../lib/format';
import { useSeo } from '../lib/seo';
import { Avatar, EmptyState, Spinner } from '../components/ui';
import type { Conversation, DirectoryUser, Message, Paginated } from '../types';

const EMOJI = ['👍', '🎉', '🔥', '❤️', '😂', '🚀', '👀', '🙏', '💯', '✨'];

export function ChatPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { connected, typing, onlineIds } = useSocketEvents();
  const [params, setParams] = useSearchParams();

  const [activeId, setActiveId] = useState<string | null>(params.get('c'));
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSeo({
    title: 'ข้อความ',
    description: 'แชทกับชุมชน WKSL แบบเรียลไทม์',
    path: '/chat',
    noIndex: true,
  });

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/chat/conversations'),
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.lastMessage?.content.toLowerCase().includes(q),
    );
  }, [conversations, search]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const messagesQuery = useQuery({
    queryKey: ['messages', activeId],
    queryFn: () =>
      api.get<{ items: Message[]; nextCursor: string | null }>(
        `/chat/conversations/${activeId}/messages${activeId ? `?limit=50` : ''}`,
      ),
    enabled: Boolean(activeId),
  });

  // Mark read + join the socket room when the conversation changes.
  useEffect(() => {
    if (!activeId || !user) return;
    const socket = getSocket(user.id);
    socket?.emit('chat:join', { conversationId: activeId });
    socket?.emit('chat:read', { conversationId: activeId });
    api.post(`/chat/conversations/${activeId}/read`, { conversationId: activeId }).catch(() => undefined);
    return () => {
      socket?.emit('chat:leave', { conversationId: activeId });
    };
  }, [activeId, user]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (activeId) next.set('c', activeId);
    else next.delete('c');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      api.post<Message>(`/chat/conversations/${activeId}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', activeId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => toast.error(err.message),
  });

  // Live incoming messages.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket(user.id);
    if (!socket) return;

    const onMessage = (payload: MessageEvent) => {
      if (payload.conversationId !== activeId) {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        return;
      }
      queryClient.setQueryData<{ items: Message[]; nextCursor: string | null }>(
        ['messages', activeId],
        (prev) => {
          if (!prev) return prev;
          if (prev.items.some((m) => m.id === payload.id)) return prev;
          const incoming: Message = {
            id: payload.id,
            content: payload.content,
            createdAt: payload.createdAt,
            isMine: false,
            sender: payload.sender,
          };
          return { ...prev, items: [...prev.items, incoming] };
        },
      );
      socket.emit('chat:read', { conversationId: activeId });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const onTyping = () => queryClient.invalidateQueries({ queryKey: ['messages', activeId] });

    socket.on('chat:message', onMessage);
    socket.on('chat:read', onTyping);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:read', onTyping);
    };
  }, [activeId, user, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data?.items.length, activeId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeId) return;

    const socket = getSocket(user?.id ?? null);
    if (socket?.connected) {
      socket.emit('chat:send', { conversationId: activeId, content: text });
      setDraft('');
    } else {
      sendMessage.mutate(text, { onSuccess: () => setDraft('') });
    }
  };

  const handleTyping = (value: string) => {
    setDraft(value);
    if (!activeId || !user) return;
    const socket = getSocket(user.id);
    if (!socket?.connected) return;

    socket.emit('chat:typing', { conversationId: activeId, isTyping: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('chat:typing', { conversationId: activeId, isTyping: false });
    }, 1500);
  };

  const typingHere = activeId ? (typing.get(activeId) ?? []) : [];
  const messages = messagesQuery.data?.items ?? [];

  if (isLoading) {
    return (
      <div className="card flex h-[70vh] items-center justify-center">
        <Spinner className="h-7 w-7 text-brand-500" />
      </div>
    );
  }

  return (
    <div className="card flex h-[calc(100vh-9rem)] min-h-[520px] overflow-hidden">
      {/* ------- Conversation list ------- */}
      <aside
        className={`w-full shrink-0 flex-col border-r border-ink-500/10 md:flex md:w-72 ${
          active ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="border-b border-ink-500/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <MessagesSquare size={17} className="text-brand-500" />
              ข้อความ
            </h1>
            <div className="flex items-center gap-1">
              <span
                title={connected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อใหม่'}
                className={`grid h-7 w-7 place-items-center rounded-lg ${
                  connected ? 'text-brand-400' : 'text-warn'
                }`}
              >
                {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
              </span>
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="btn-ghost btn-sm h-8 w-8 p-0"
                title="เริ่มแชทใหม่"
              >
                <MessageSquarePlus size={15} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาการสนทนา…"
              className="input py-2 pl-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState title="ไม่พบการสนทนา" description="เริ่มแชทกับสมาชิกท่านอื่นได้เลย" />
          ) : (
            <ul className="divide-y divide-ink-500/8">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2/60 ${
                      activeId === c.id ? 'bg-brand-500/8' : ''
                    }`}
                  >
                    {c.isDirect ? (
                      <Avatar
                        name={c.title}
                        src={c.participants[0]?.avatarUrl}
                        size="md"
                        online={onlineIds.has(c.participants[0]?.id ?? '')}
                      />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/12 text-brand-400 dark:text-brand-400">
                        <Hash size={18} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{c.title}</span>
                        {c.unreadCount > 0 && (
                          <span className="ml-auto grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-black">
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-400">
                        {c.lastMessage
                          ? `${c.lastMessage.isMine ? 'คุณ: ' : ''}${c.lastMessage.content}`
                          : 'ยังไม่มีข้อความ'}
                      </span>
                    </span>
                    {c.lastMessage && (
                      <span className="shrink-0 text-[10px] text-ink-400">
                        {timeAgo(c.lastMessage.createdAt).replace('ที่แล้ว', '')}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ------- Thread ------- */}
      <section className={`flex min-w-0 flex-1 flex-col ${active ? 'flex' : 'hidden md:flex'}`}>
        {!active ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<MessagesSquare size={38} />}
              title="เลือกการสนทนา"
              description="เลือกห้องจากด้านซ้าย หรือเริ่มแชทใหม่เพื่อพูดคุยกับสมาชิกคนอื่น"
            />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-ink-500/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="btn-ghost btn-sm h-8 w-8 p-0 md:hidden"
                aria-label="ย้อนกลับ"
              >
                <ArrowLeft size={16} />
              </button>
              {active.isDirect ? (
                <Avatar
                  name={active.title}
                  src={active.participants[0]?.avatarUrl}
                  size="sm"
                  online={onlineIds.has(active.participants[0]?.id ?? '')}
                />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/12 text-brand-400 dark:text-brand-400">
                  <Hash size={16} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{active.title}</p>
                <p className="truncate text-xs text-ink-400">
                  {active.isDirect
                    ? active.participants[0]?.username
                      ? `@${active.participants[0].username}`
                      : 'แชทส่วนตัว'
                    : `${active.memberCount} สมาชิก`}
                </p>
              </div>
              {!active.isDirect && (
                <button
                  type="button"
                  onClick={() => setShowMembers(true)}
                  className="btn-ghost btn-sm"
                  title="สมาชิกในห้อง"
                >
                  <UsersIcon size={15} />
                </button>
              )}
            </header>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
              {messages.length === 0 && (
                <EmptyState title="ยังไม่มีข้อความ" description="เริ่มต้นการสนทนาด้วยข้อความแรกเลย" />
              )}

              {messages.map((m, i) => {
                const showAvatar =
                  i === 0 || messages[i - 1].sender.id !== m.sender.id || m.isMine !== messages[i - 1].isMine;
                const grouped = !showAvatar;
                return (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 ${m.isMine ? 'flex-row-reverse' : ''} ${
                      grouped ? 'mt-1' : 'mt-4'
                    }`}
                  >
                    {showAvatar ? (
                      <Avatar
                        name={m.sender.displayName}
                        src={m.sender.avatarUrl}
                        size="sm"
                        className="mt-0.5"
                      />
                    ) : (
                      <span className="w-8 shrink-0" />
                    )}
                    <div className={`min-w-0 max-w-[78%] ${m.isMine ? 'items-end text-right' : ''}`}>
                      {showAvatar && (
                        <p className="mb-1 flex items-center gap-2 text-xs">
                          {!m.isMine && <span className="font-semibold">{m.sender.displayName}</span>}
                          <span className="text-ink-400">{formatTime(m.createdAt)}</span>
                        </p>
                      )}
                      <div
                        className={`inline-block rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                          m.isMine
                            ? 'bg-brand-500 font-semibold text-black'
                            : 'bg-surface-2 text-ink-900'
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            <div className="h-5 px-4 text-xs text-ink-400">
              {typingHere.length > 0 && (
                <span className="animate-pop inline-flex items-center gap-1.5">
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400"
                      style={{ animationDelay: '0.15s' }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400"
                      style={{ animationDelay: '0.3s' }}
                    />
                  </span>
                  {typingHere.map((t) => t.displayName).join(', ')} กำลังพิมพ์…
                </span>
              )}
            </div>

            {/* Composer */}
            <form onSubmit={handleSend} className="border-t border-ink-500/10 p-3">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="btn-ghost btn-sm mb-0.5 h-9 w-9 p-0"
                  onClick={() => setDraft((d) => `${d}😊`)}
                  title="อิโมจิ"
                >
                  <Smile size={17} />
                </button>
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => handleTyping(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  rows={1}
                  maxLength={4000}
                  placeholder="พิมพ์ข้อความ… (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
                  className="input max-h-32 min-h-[40px] flex-1 resize-none py-2.5"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sendMessage.isPending}
                  className="btn-primary h-10 w-10 shrink-0 p-0"
                  aria-label="ส่งข้อความ"
                >
                  {sendMessage.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
              <div className="mt-1.5 flex gap-1 overflow-x-auto">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setDraft((d) => d + e)}
                    className="rounded-md px-1.5 py-0.5 text-sm transition hover:bg-surface-2"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </form>
          </>
        )}
      </section>

      {showMembers && active && (
        <MembersModal conversation={active} onClose={() => setShowMembers(false)} />
      )}
      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onCreated={(c) => {
            setShowNew(false);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            setActiveId(c.id);
          }}
        />
      )}
    </div>
  );
}

function MembersModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const { onlineIds } = useSocketEvents();
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card animate-pop w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">สมาชิกในห้อง</h2>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm -mr-2">
            ✕
          </button>
        </div>
        <ul className="space-y-2">
          {conversation.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
              <Avatar name={p.displayName} src={p.avatarUrl} size="sm" online={onlineIds.has(p.id)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.displayName}</p>
                <p className="truncate text-xs text-ink-400">@{p.username}</p>
              </div>
              {p.role === 'ADMIN' && (
                <span className="badge bg-brand-500/12 text-brand-400 dark:text-brand-400">แอดมิน</span>
              )}
            </li>
          ))}
          {conversation.participants.length === 0 && (
            <li className="py-6 text-center text-sm text-ink-400">ยังไม่มีสมาชิกอื่นในห้อง</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function NewConversationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Conversation) => void;
}) {
  const [mode, setMode] = useState<'dm' | 'room'>('dm');
  const [title, setTitle] = useState('');
  const [userId, setUserId] = useState('');
  const [query, setQuery] = useState('');

  const { data: users } = useQuery({
    queryKey: ['users', 'dm-picker'],
    queryFn: () => api.get<Paginated<DirectoryUser>>(`/users?q=${encodeURIComponent(query)}&perPage=20`),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      mode === 'dm'
        ? api.post<Conversation>('/chat/conversations', { participantId: userId })
        : api.post<Conversation>('/chat/conversations', { title }),
    onSuccess: onCreated,
    onError: (err) => toast.error(err.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card animate-pop w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">เริ่มการสนทนา</h2>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm -mr-2">
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
          {([
            ['dm', 'แชทส่วนตัว'],
            ['room', 'สร้างห้อง'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
                mode === key ? 'bg-surface-1 text-ink-900 shadow-sm' : 'text-ink-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'dm' ? (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาสมาชิก…"
              className="input mb-3"
              autoFocus
            />
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {users?.items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setUserId(u.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-surface-2 ${
                      userId === u.id ? 'bg-brand-500/10' : ''
                    }`}
                  >
                    <Avatar name={u.displayName} src={u.avatarUrl} size="sm" online={u.isOnline} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.displayName}</span>
                      <span className="block truncate text-xs text-ink-400">@{u.username}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <label className="label" htmlFor="room-title">
              ชื่อห้อง
            </label>
            <input
              id="room-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น Frontend Guild"
              className="input"
              autoFocus
            />
            <p className="mt-2 text-xs text-ink-400">
              ห้องที่คุณสร้างจะมีคุณเป็นสมาชิกคนแรก และสามารถเชิญสมาชิกอื่นได้ภายหลัง
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={
            createMutation.isPending || (mode === 'dm' ? !userId : title.trim().length < 2)
          }
          className="btn-primary mt-4 w-full"
        >
          {createMutation.isPending && <Loader2 size={15} className="animate-spin" />}
          เริ่มสนทนา
        </button>
      </div>
    </div>
  );
}