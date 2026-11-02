import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getSocket } from '../lib/socket';
import type {
  WatchStateEvent,
  WatchJoinedEvent,
  WatchLeftEvent,
  WatchPlayedEvent,
  WatchPausedEvent,
  WatchSeekedEvent,
  WatchChangedEvent,
} from '../lib/socket';

export default function WatchPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const [roomState, setRoomState] = useState<{
    mediaUrl: string;
    mediaType: 'video' | 'audio' | 'image';
    currentTime: number;
    isPlaying: boolean;
    hostId: string;
    userCount: number;
    updatedAt: number;
  } | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; displayName: string; avatarUrl: string | null }>>([]);
  const [chat] = useState<Array<{ id: string; user: { id: string; displayName: string }; content: string; createdAt: string }>>([]);
  const [mediaInput, setMediaInput] = useState('');
  const [mediaType, setMediaType] = useState<'video' | 'audio' | 'image'>('video');

  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const isLocal = useRef(false);
  const readyRef = useRef(false);

  if (!user) {
    navigate('/login');
    return null;
  }
  if (!roomId) return null;

  // ---- Socket lifecycle ----------------------------------------------------
  useEffect(() => {
    const socket = getSocket(user.id);
    socketRef.current = socket;
    if (!socket) return;

    const onState = (payload: WatchStateEvent) => {
      if (payload.roomId !== roomId) return;
      isLocal.current = false;
      setRoomState((prev) => {
        if (!prev) return prev;
        if (payload.updatedAt >= (prev.updatedAt ?? 0)) {
          return {
            mediaUrl: payload.mediaUrl,
            mediaType: payload.mediaType,
            currentTime: payload.currentTime,
            isPlaying: payload.isPlaying,
            hostId: payload.hostId,
            userCount: payload.userCount,
            updatedAt: payload.updatedAt,
          };
        }
        return prev;
      });
      applyMediaToElement();
    };

    const onJoined = (payload: WatchJoinedEvent) => {
      if (payload.roomId !== roomId) return;
      setUsers((prev) => {
        if (prev.some((u) => u.id === payload.user.id)) return prev;
        return [...prev, payload.user];
      });
      setRoomState((prev) => (prev ? { ...prev, userCount: payload.userCount } : null));
    };

    const onLeft = (payload: WatchLeftEvent) => {
      if (payload.roomId !== roomId) return;
      setUsers((prev) => prev.filter((u) => u.id !== payload.userId));
      setRoomState((prev) => (prev ? { ...prev, userCount: payload.userCount } : null));
    };

    const onPlayed = (payload: WatchPlayedEvent) => {
      if (payload.roomId !== roomId) return;
      isLocal.current = false;
      setRoomState((prev) => (prev ? { ...prev, currentTime: payload.currentTime, isPlaying: true, updatedAt: payload.updatedAt } : null));
      if (mediaRef.current) {
        mediaRef.current.currentTime = payload.currentTime;
        mediaRef.current.play().catch(() => undefined);
      }
    };

    const onPaused = (payload: WatchPausedEvent) => {
      if (payload.roomId !== roomId) return;
      isLocal.current = false;
      setRoomState((prev) => (prev ? { ...prev, currentTime: payload.currentTime, isPlaying: false, updatedAt: payload.updatedAt } : null));
      if (mediaRef.current) {
        mediaRef.current.currentTime = payload.currentTime;
        mediaRef.current.pause();
      }
    };

    const onSeeked = (payload: WatchSeekedEvent) => {
      if (payload.roomId !== roomId) return;
      isLocal.current = false;
      setRoomState((prev) => (prev ? { ...prev, currentTime: payload.currentTime, isPlaying: payload.isPlaying, updatedAt: payload.updatedAt } : null));
      if (mediaRef.current) mediaRef.current.currentTime = payload.currentTime;
    };

    const onChanged = (payload: WatchChangedEvent) => {
      if (payload.roomId !== roomId) return;
      isLocal.current = false;
      setRoomState({
        mediaUrl: payload.mediaUrl,
        mediaType: payload.mediaType,
        currentTime: 0,
        isPlaying: false,
        hostId: payload.hostId,
        userCount: roomState?.userCount ?? 1,
        updatedAt: payload.updatedAt,
      });
      readyRef.current = false;
      applyMediaToElement();
    };

    socket.on('watch:state', onState);
    socket.on('watch:joined', onJoined);
    socket.on('watch:left', onLeft);
    socket.on('watch:played', onPlayed);
    socket.on('watch:paused', onPaused);
    socket.on('watch:seeked', onSeeked);
    socket.on('watch:changed', onChanged);

    socket.emit('watch:join', { roomId, mediaUrl: '', mediaType: 'video' });

    return () => {
      socket.off('watch:state', onState);
      socket.off('watch:joined', onJoined);
      socket.off('watch:left', onLeft);
      socket.off('watch:played', onPlayed);
      socket.off('watch:paused', onPaused);
      socket.off('watch:seeked', onSeeked);
      socket.off('watch:changed', onChanged);
      socket.emit('watch:leave', { roomId });
    };
  }, [user, roomId, roomState]);

  // ---- Media element sync --------------------------------------------------
  const applyMediaToElement = useCallback(() => {
    const el = mediaRef.current;
    if (!el || !roomState) return;
    if (roomState.mediaType === 'video' || roomState.mediaType === 'audio') {
      (el as HTMLVideoElement).src = roomState.mediaUrl;
      (el as HTMLVideoElement).currentTime = roomState.currentTime;
      if (roomState.isPlaying) el.play().catch(() => undefined);
      else el.pause();
    } else {
      el.pause();
      el.src = '';
    }
  }, [roomState]);

  useEffect(() => {
    if (readyRef.current && roomState) applyMediaToElement();
    readyRef.current = true;
  }, [roomState, applyMediaToElement]);

  // ---- Local media events -> broadcast to server ---------------------------
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const onPlay = () => {
      isLocal.current = true;
      socketRef.current?.emit('watch:play', { roomId, currentTime: el.currentTime });
    };
    const onPause = () => {
      isLocal.current = true;
      socketRef.current?.emit('watch:pause', { roomId, currentTime: el.currentTime });
    };
    const onSeek = () => {
      isLocal.current = true;
      socketRef.current?.emit('watch:seek', { roomId, currentTime: el.currentTime });
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('seeked', onSeek);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('seeked', onSeek);
    };
  }, [roomId]);

  // ---- Actions -------------------------------------------------------------
  const host = roomState?.hostId === user.id;

  const setMedia = (url: string, type: 'video' | 'audio' | 'image') => {
    isLocal.current = true;
    socketRef.current?.emit('watch:change', { roomId, mediaUrl: url, mediaType: type });
    setRoomState((prev) => (prev ? { ...prev, mediaUrl: url, mediaType: type, currentTime: 0, isPlaying: false } : null));
  };

  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    isLocal.current = true;
    if (el.paused) {
      el.play().catch(() => undefined);
      socketRef.current?.emit('watch:play', { roomId, currentTime: el.currentTime });
    } else {
      el.pause();
      socketRef.current?.emit('watch:pause', { roomId, currentTime: el.currentTime });
    }
  };

  const seek = (seconds: number) => {
    const el = mediaRef.current;
    if (!el) return;
    isLocal.current = true;
    el.currentTime = seconds;
    socketRef.current?.emit('watch:seek', { roomId, currentTime: seconds });
  };

  const isImage = roomState?.mediaType === 'image';

  return (
    <div className="min-h-screen bg-surface-0 text-ink-900">
      <header className="glass sticky top-0 z-40 border-b border-ink-500/10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate('/')}
            aria-label="ย้อนกลับ"
          >
            ← กลับหน้าแรก
          </button>
          <h1 className="text-lg font-bold text-ink-900">ดูร่วมกัน</h1>
          <span className="ml-auto text-xs text-ink-500">
            ห้อง {roomId} ・ {roomState?.userCount ?? 0} คน
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 flex flex-col lg:flex-row gap-6">
        {/* ---------- Media ---------- */}
        <div className="flex-1 min-w-0 bg-surface-1 rounded-2xl border border-ink-500/12 overflow-hidden flex flex-col items-center justify-center">
          {isImage && roomState?.mediaUrl && (
            <img
              src={roomState.mediaUrl}
              alt="watch"
              className="max-w-full max-h-[60vh] object-contain"
            />
          )}
          {!isImage && (
            <video
              ref={mediaRef}
              className="max-w-full max-h-[60vh] bg-black"
              controls
              crossOrigin="anonymous"
            />
          )}
          {!roomState?.mediaUrl && (
            <div className="text-ink-500 text-sm">ยังไม่มีสื่อในห้องนี้ ผู้ดูแลห้องสามารถใส่ลิงก์วิดีโอ/เสียงได้</div>
          )}
          <div className="mt-3 flex items-center gap-2">
            {!host && <span className="text-xs text-ink-500">ผู้ดูแล: {users.find((u) => u.id === roomState?.hostId)?.displayName ?? '-'}</span>}
            {host && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={mediaInput}
                  onChange={(e) => setMediaInput(e.target.value)}
                  placeholder="ลิงก์วิดีโอ / เสียง / รูปภาพ"
                  className="input flex-1"
                />
                <select
                  className="input"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as 'video' | 'audio' | 'image')}
                >
                  <option value="video">วิดีโอ</option>
                  <option value="audio">เสียง</option>
                  <option value="image">รูปภาพ</option>
                </select>
                <button type="button" className="btn-primary btn-sm" onClick={() => {
                  if (!mediaInput.trim()) return;
                  setMedia(mediaInput.trim(), mediaType);
                }}>
                  เปลี่ยนสื่อ
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Controls + Chat ---------- */}
        <div className="lg:w-96 flex flex-col gap-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-ink-900 mb-3">ควบคุม</h2>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" onClick={togglePlay} disabled={!roomState?.mediaUrl}>
                {roomState?.isPlaying ? 'หยุดชั่วคราว' : 'เล่น'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => seek(-10)} disabled={!roomState?.mediaUrl}>-10s</button>
              <button type="button" className="btn-secondary" onClick={() => seek(10)} disabled={!roomState?.mediaUrl}>+10s</button>
            </div>
            {host && (
              <div className="mt-3 pt-3 border-t border-ink-500/10">
                <p className="text-xs text-ink-500 mb-2">เปลี่ยนสื่อ (เฉพาะผู้ดูแล)</p>
                <input
                  type="text"
                  placeholder="วางลิงก์ไฟล์วิดีโอ/เสียง/รูป"
                  className="input mb-2"
                  value={mediaInput}
                  onChange={(e) => setMediaInput(e.target.value)}
                />
                <select
                  className="input mb-2"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as 'video' | 'audio' | 'image')}
                >
                  <option value="video">วิดีโอ</option>
                  <option value="audio">เสียง</option>
                  <option value="image">รูปภาพ</option>
                </select>
                <button type="button" className="btn-primary w-full" onClick={() => {
                  if (!mediaInput.trim()) return;
                  setMedia(mediaInput.trim(), mediaType);
                }}>
                  ยืนยันเปลี่ยน
                </button>
              </div>
            )}
          </div>

          <div className="card flex-1 flex-col">
            <h2 className="text-sm font-semibold text-ink-900 mb-3">พูดคุย</h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {chat.map((m) => (
                <div key={m.id} className="flex gap-2">
                  <div className="flex-shrink-0">{m.user.displayName.charAt(0)}</div>
                  <div>
                    <div className="text-xs font-medium text-ink-900">{m.user.displayName}</div>
                    <div className="text-sm text-ink-700">{m.content}</div>
                    <div className="text-[10px] text-ink-400 mt-0.5">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              // Local chat only for now; persist to DB later if needed.
            }} className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="พิมพ์ข้อความ…"
                className="input flex-1"
              />
              <button type="submit" className="btn-primary px-4" disabled>
                ส่ง
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-ink-500 border-t border-ink-500/10">
        เคล็ดลับ: วางลิงก์ไฟล์วิดีโอ (mp4/webm) หรือเสียง (mp3/wav) โดยตรง ・ห้องนี้ใช้ Socket.IO ซิงค์เล่น/หยุด/ข้ามแบบเรียลไทม์
      </div>
    </div>
  );
}
