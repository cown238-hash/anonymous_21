import type { Server } from 'socket.io';

/**
 * Small indirection so services/routes can emit events without importing the
 * io instance directly (which would create a circular import at boot time).
 */
let io: Server | null = null;

export function setIo(server: Server): void {
  io = server;
}

export function getIo(): Server | null {
  return io;
}

/** Per-user room: `user:<id>` */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToUsers(userIds: string[], event: string, payload: unknown): void {
  if (!io) return;
  for (const id of userIds) io.to(userRoom(id)).emit(event, payload);
}

export function broadcast(event: string, payload: unknown): void {
  io?.emit(event, payload);
}

export function onlineUserIds(): string[] {
  if (!io) return [];
  const ids = new Set<string>();
  for (const socket of io.sockets.sockets.values()) {
    const userId = (socket.data as { userId?: string }).userId;
    if (userId) ids.add(userId);
  }
  return [...ids];
}