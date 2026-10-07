import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';
import type { User } from '../types';

let socket: Socket | null = null;
let currentUserId: string | null = null;

/**
 * `type` (not `interface`) is required here: socket.io constrains the event maps
 * to `EventsMap`, which needs an implicit index signature that only type
 * aliases provide.
 */
export type ServerToClientEvents = {
  ready: (payload: { user: unknown; onlineCount: number }) => void;
  'chat:message': (payload: MessageEvent) => void;
  'chat:typing': (payload: TypingEvent) => void;
  'chat:read': (payload: { conversationId: string; userId: string; readAt: string }) => void;
  'chat:error': (payload: { message: string }) => void;
  'presence:online': (payload: unknown) => void;
  'presence:joined': (payload: unknown) => void;
  'presence:left': (payload: unknown) => void;
  'notification:new': (payload: unknown) => void;
  'user:updated': (payload: unknown) => void;
  connect_error: (err: Error) => void;
};

export type ClientToServerEvents = {
  'chat:join': (payload: { conversationId: string }) => void;
  'chat:leave': (payload: { conversationId: string }) => void;
  'chat:send': (payload: { conversationId: string; content: string }) => void;
  'chat:typing': (payload: { conversationId: string; isTyping: boolean }) => void;
  'chat:read': (payload: { conversationId: string }) => void;
};

export interface MessageEvent {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  /** Fully serialised user, matching `Message['sender']`. */
  sender: User;
  isMine: boolean;
}

export interface TypingEvent {
  conversationId: string;
  user: { id: string; displayName: string };
  isTyping: boolean;
}

/** Lazily create (or recreate) the singleton socket for the signed-in user. */
export function getSocket(userId: string | null): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  if (!userId) {
    socket?.disconnect();
    socket = null;
    currentUserId = null;
    return null;
  }

  if (socket && currentUserId === userId) return socket;
  if (socket) socket.disconnect();

  const token = getAccessToken();
  if (!token) return null;

  currentUserId = userId;
  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
    withCredentials: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 20,
  });

  return socket;
}

export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
  currentUserId = null;
}