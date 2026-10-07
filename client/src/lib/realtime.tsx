import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { getSocket } from './socket';
import type { TypingEvent } from './socket';
import type { User as UserType } from '../types';

interface OnlineUser extends Partial<UserType> {
  id: string;
  isOnline: boolean;
}

interface RealtimeValue {
  connected: boolean;
  /** Transient notifications that arrived while browsing (not yet persisted). */
  notifications: number;
  onlineUsers: OnlineUser[];
  onlineIds: Set<string>;
  typing: Map<string, Array<{ id: string; displayName: string }>>;
}

const RealtimeContext = createContext<RealtimeValue>({
  connected: false,
  notifications: 0,
  onlineUsers: [],
  onlineIds: new Set(),
  typing: new Map(),
});

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [typing, setTyping] = useState<Map<string, Array<{ id: string; displayName: string }>>>(new Map());
  const socketRef = useRef<ReturnType<typeof getSocket>>(null);

  useEffect(() => {
    const socket = getSocket(user?.id ?? null);
    socketRef.current = socket;
    if (!socket) {
      setConnected(false);
      setOnlineUsers([]);
      return;
    }

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onNotification = () => {
      setNotifications((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['stats', 'me'] });
    };

    const onPresence = (payload: unknown) => {
      const list = Array.isArray(payload) ? (payload as OnlineUser[]) : [];
      setOnlineUsers(list);
    };

    const onTyping = (payload: TypingEvent) => {
      setTyping((prev) => {
        const next = new Map(prev);
        const list = next.get(payload.conversationId) ?? [];
        next.set(
          payload.conversationId,
          payload.isTyping
            ? [...list.filter((u) => u.id !== payload.user.id), payload.user]
            : list.filter((u) => u.id !== payload.user.id),
        );
        return next;
      });
    };

    const onUserUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['stats', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('notification:new', onNotification);
    socket.on('presence:online', onPresence);
    socket.on('chat:typing', onTyping);
    socket.on('user:updated', onUserUpdated);

    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('notification:new', onNotification);
      socket.off('presence:online', onPresence);
      socket.off('chat:typing', onTyping);
      socket.off('user:updated', onUserUpdated);
    };
  }, [user?.id, queryClient]);

  const value = useMemo<RealtimeValue>(
    () => ({
      connected,
      notifications,
      onlineUsers,
      onlineIds: new Set(onlineUsers.map((u) => u.id)),
      typing,
    }),
    [connected, notifications, onlineUsers, typing],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useSocketEvents(): RealtimeValue {
  return useContext(RealtimeContext);
}

/** Publishes transient notifications back into the sidebar badge. */
export function useNotificationBadge(clear: () => void) {
  const { notifications } = useSocketEvents();
  const value = notifications;
  return { value, clear };
}