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
  'watch:state': (payload: WatchStateEvent) => void;
  'watch:joined': (payload: WatchJoinedEvent) => void;
  'watch:left': (payload: WatchLeftEvent) => void;
  'watch:played': (payload: WatchPlayedEvent) => void;
  'watch:paused': (payload: WatchPausedEvent) => void;
  'watch:seeked': (payload: WatchSeekedEvent) => void;
  'watch:changed': (payload: WatchChangedEvent) => void;
  connect_error: (err: Error) => void;
};

export type ClientToServerEvents = {
  'chat:join': (payload: { conversationId: string }) => void;
  'chat:leave': (payload: { conversationId: string }) => void;
  'chat:send': (payload: { conversationId: string; content: string }) => void;
  'chat:typing': (payload: { conversationId: string; isTyping: boolean }) => void;
  'chat:read': (payload: { conversationId: string }) => void;
  'watch:join': (payload: { roomId: string; mediaUrl?: string; mediaType?: 'video' | 'audio' | 'image' }) => void;
  'watch:leave': (payload: { roomId?: string }) => void;
  'watch:play': (payload: { roomId?: string; currentTime?: number }) => void;
  'watch:pause': (payload: { roomId?: string; currentTime?: number }) => void;
  'watch:seek': (payload: { roomId?: string; currentTime?: number }) => void;
  'watch:change': (payload: { roomId?: string; mediaUrl?: string; mediaType?: 'video' | 'audio' | 'image' }) => void;
};

export interface WatchStateEvent {
  roomId: string;
  mediaUrl: string;
  mediaType: 'video' | 'audio' | 'image';
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  hostId: string;
  userCount: number;
}

export interface WatchJoinedEvent {
  roomId: string;
  user: { id: string; displayName: string; avatarUrl: string | null };
  userCount: number;
}

export interface WatchLeftEvent {
  roomId: string;
  userId: string;
  userCount: number;
}

export interface WatchPlayedEvent {
  roomId: string;
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  by: string;
}

export interface WatchPausedEvent {
  roomId: string;
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  by: string;
}

export interface WatchSeekedEvent {
  roomId: string;
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  by: string;
}

export interface WatchChangedEvent {
  roomId: string;
  mediaUrl: string;
  mediaType: 'video' | 'audio' | 'image';
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  hostId: string;
  by: string;
}

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