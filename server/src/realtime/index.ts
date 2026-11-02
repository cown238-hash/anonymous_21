import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { publicUserSelect, serializeUser } from '../serializers/index.js';
import { broadcast, emitToUser, onlineUserIds, setIo, userRoom } from './emitter.js';
import { sendWebPush } from '../services/push.js';

interface SocketData {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AuthedSocket {
  id: string;
  data: SocketData;
  join: (room: string) => Promise<void>;
  leave: (room: string) => Promise<void>;
  to: (room: string) => { emit: (event: string, payload: unknown) => void };
  emit: (event: string, payload: unknown) => void;
  on: (event: string, handler: (...args: never[]) => void) => void;
  handshake: { auth: Record<string, unknown>; headers: Record<string, unknown> };
  rooms: Set<string>;
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigins,
      credentials: true,
    },
    path: '/socket.io',
  });

  // ---- Auth middleware -----------------------------------------------------
  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace('Bearer ', '')
          : undefined);

      if (!token) return next(new Error('unauthorized'));

      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { ...publicUserSelect, isBanned: true },
      });
      if (!user || user.isBanned) return next(new Error('unauthorized'));

      socket.data = {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      } satisfies SocketData;

      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // ---- Connection ---------------------------------------------------------
  io.on('connection', (raw) => {
    const socket = raw as unknown as AuthedSocket;
    const me = socket.data;

    socket.join(userRoom(me.userId));
    prisma.user
      .update({ where: { id: me.userId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    socket.emit('ready', {
      user: {
        id: me.userId,
        username: me.username,
        displayName: me.displayName,
        avatarUrl: me.avatarUrl,
      },
      onlineCount: io.engine.clientsCount,
    });

    // Tell everyone the roster changed.
    setImmediate(async () => {
      const ids = new Set<string>();
      for (const s of io.sockets.sockets.values()) {
        const id = (s.data as SocketData).userId;
        if (id) ids.add(id);
      }
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: publicUserSelect,
        orderBy: { lastSeenAt: 'desc' },
      });
      broadcast('presence:online', users.map((u) => ({ ...serializeUser(u), isOnline: true })));
    });

    // ---- Conversation rooms ---------------------------------------------
    socket.on('chat:join', async (payload: { conversationId?: string } | string) => {
      const conversationId =
        typeof payload === 'string' ? payload : payload?.conversationId;
      if (!conversationId) return;

      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: me.userId } },
        select: { conversationId: true },
      });
      if (!member) return;

      await socket.join(`conversation:${conversationId}`);
      socket.to(`conversation:${conversationId}`).emit('presence:joined', {
        conversationId,
        user: { id: me.userId, displayName: me.displayName, avatarUrl: me.avatarUrl },
      });
    });

    socket.on('chat:leave', async (payload: { conversationId?: string } | string) => {
      const conversationId =
        typeof payload === 'string' ? payload : payload?.conversationId;
      if (!conversationId) return;
      await socket.leave(`conversation:${conversationId}`);
      socket.to(`conversation:${conversationId}`).emit('presence:left', {
        conversationId,
        userId: me.userId,
      });
    });

    // ---- Watch Party rooms -------------------------------------------------
    interface WatchRoom {
      hostId: string;
      mediaUrl: string;
      mediaType: 'video' | 'audio' | 'image';
      currentTime: number;
      isPlaying: boolean;
      updatedAt: number;
      users: Set<string>;
    }
    const watchRooms = new Map<string, WatchRoom>();

    function watchRoomId(_roomId: string) {
      return 'watch:main';
    }

    socket.on('watch:join', async (payload: { roomId: string; mediaUrl?: string; mediaType?: 'video' | 'audio' | 'image' }) => {
      const { roomId, mediaUrl, mediaType } = payload ?? {};
      if (!roomId) return;
      const room = watchRoomId(roomId);

      let state = watchRooms.get(roomId);
      if (!state) {
        state = {
          hostId: me.userId,
          mediaUrl: mediaUrl ?? '',
          mediaType: mediaType ?? 'video',
          currentTime: 0,
          isPlaying: false,
          updatedAt: Date.now(),
          users: new Set(),
        };
        watchRooms.set(roomId, state);
      }
      state.users.add(me.userId);
      await socket.join(room);

      // Sync current state to the joiner.
      socket.emit('watch:state', {
        roomId,
        mediaUrl: state.mediaUrl,
        mediaType: state.mediaType,
        currentTime: state.currentTime,
        isPlaying: state.isPlaying,
        updatedAt: state.updatedAt,
        hostId: state.hostId,
        userCount: state.users.size,
      });

      // Tell others someone joined.
      socket.to(room).emit('watch:joined', {
        roomId,
        user: { id: me.userId, displayName: me.displayName, avatarUrl: me.avatarUrl },
        userCount: state.users.size,
      });
    });

    socket.on('watch:leave', (payload: { roomId?: string }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const room = watchRoomId(roomId);
      const state = watchRooms.get(roomId);
      if (state) {
        state.users.delete(me.userId);
        if (state.users.size === 0) {
          watchRooms.delete(roomId);
        } else if (state.hostId === me.userId) {
          // Transfer host to next user.
          const next = state.users.values().next().value;
          if (next) state.hostId = next;
        }
      }
      socket.leave(room);
      socket.to(room).emit('watch:left', {
        roomId,
        userId: me.userId,
        userCount: state ? state.users.size : 0,
      });
    });

    socket.on('watch:play', (payload: { roomId?: string; currentTime?: number }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const room = watchRoomId(roomId);
      const state = watchRooms.get(roomId);
      if (!state) return;
      // Only host or anyone can play; keep simple: any user can request play.
      state.isPlaying = true;
      if (typeof payload.currentTime === 'number') state.currentTime = payload.currentTime;
      state.updatedAt = Date.now();
      socket.to(room).emit('watch:played', {
        roomId,
        currentTime: state.currentTime,
        isPlaying: true,
        updatedAt: state.updatedAt,
        by: me.userId,
      });
    });

    socket.on('watch:pause', (payload: { roomId?: string; currentTime?: number }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const room = watchRoomId(roomId);
      const state = watchRooms.get(roomId);
      if (!state) return;
      state.isPlaying = false;
      if (typeof payload.currentTime === 'number') state.currentTime = payload.currentTime;
      state.updatedAt = Date.now();
      socket.to(room).emit('watch:paused', {
        roomId,
        currentTime: state.currentTime,
        isPlaying: false,
        updatedAt: state.updatedAt,
        by: me.userId,
      });
    });

    socket.on('watch:seek', (payload: { roomId?: string; currentTime?: number }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const room = watchRoomId(roomId);
      const state = watchRooms.get(roomId);
      if (!state) return;
      if (typeof payload.currentTime === 'number') state.currentTime = payload.currentTime;
      state.updatedAt = Date.now();
      socket.to(room).emit('watch:seeked', {
        roomId,
        currentTime: state.currentTime,
        isPlaying: state.isPlaying,
        updatedAt: state.updatedAt,
        by: me.userId,
      });
    });

    socket.on('watch:change', (payload: { roomId?: string; mediaUrl?: string; mediaType?: 'video' | 'audio' | 'image' }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const room = watchRoomId(roomId);
      const state = watchRooms.get(roomId);
      if (!state) return;
      // Only host can change media.
      if (state.hostId !== me.userId) return;
      if (typeof payload.mediaUrl === 'string') state.mediaUrl = payload.mediaUrl;
      if (payload.mediaType) state.mediaType = payload.mediaType;
      state.currentTime = 0;
      state.isPlaying = false;
      state.updatedAt = Date.now();
      socket.to(room).emit('watch:changed', {
        roomId,
        mediaUrl: state.mediaUrl,
        mediaType: state.mediaType,
        currentTime: 0,
        isPlaying: false,
        updatedAt: state.updatedAt,
        by: me.userId,
      });
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('watch:')) {
          const roomId = room.replace('watch:', '');
          const state = watchRooms.get(roomId);
          if (state) {
            state.users.delete(me.userId);
            if (state.users.size === 0) {
              watchRooms.delete(roomId);
            } else if (state.hostId === me.userId) {
              const next = state.users.values().next().value;
              if (next) state.hostId = next;
            }
            socket.to(room).emit('watch:left', {
              roomId,
              userId: me.userId,
              userCount: state.users.size,
            });
          }
        }
      }
    });

    // ---- Typing indicator --------------------------------------------------
    socket.on('chat:typing', async (payload: { conversationId?: string; isTyping?: boolean } | string) => {
      const conversationId =
        typeof payload === 'string' ? payload : payload?.conversationId;
      if (!conversationId) return;
      const isTyping = typeof payload === 'string' ? true : payload.isTyping !== false;
      socket.to(`conversation:${conversationId}`).emit('chat:typing', {
        conversationId,
        user: { id: me.userId, displayName: me.displayName },
        isTyping,
      });
    });

    // ---- Send message -----------------------------------------------------
    socket.on('chat:send', async (payload: { conversationId?: string; content?: string }) => {
      const conversationId = payload?.conversationId;
      const content = payload?.content?.trim();
      if (!conversationId || !content) return;
      if (content.length > 4000) return;

      try {
        const member = await prisma.conversationMember.findUnique({
          where: { conversationId_userId: { conversationId, userId: me.userId } },
          select: { conversationId: true },
        });
        if (!member) return;

        const message = await prisma.message.create({
          data: { content, conversationId, senderId: me.userId },
          include: { sender: { select: publicUserSelect } },
        });
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        const wire = {
          id: message.id,
          conversationId,
          content: message.content,
          createdAt: message.createdAt,
          sender: serializeUser(message.sender),
          isMine: true,
        };

        io.to(`conversation:${conversationId}`).emit('chat:message', wire);

        const recipients = await prisma.conversationMember.findMany({
          where: { conversationId, userId: { not: me.userId } },
          select: { userId: true },
        });
        const convo = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { title: true, isDirect: true },
        });
        // Chat carries no persisted Notification row, so web push is the only
        // way a recipient hears about it once the socket drops. Anyone with a
        // live socket already saw the in-app toast; skip them.
        const connected = new Set(onlineUserIds());
        for (const r of recipients) {
          emitToUser(r.userId, 'notification:new', {
            id: `msg-${message.id}`,
            type: 'MESSAGE',
            title: `${me.displayName}: ${content.slice(0, 80)}`,
            body: convo?.isDirect ? null : (convo?.title ?? null),
            href: `/chat?c=${conversationId}`,
            readAt: null,
            createdAt: message.createdAt,
            transient: true,
          });
          if (!connected.has(r.userId)) {
            void sendWebPush(r.userId, {
              title: me.displayName,
              body: content.slice(0, 120),
              href: `/chat?c=${conversationId}`,
              // One ongoing conversation stacks into a single lock-screen
              // entry instead of one notification per message.
              tag: `chat-${conversationId}`,
            });
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[socket] chat:send failed', err);
        socket.emit('chat:error', { message: 'ส่งข้อความไม่สำเร็จ' });
      }
    });

    socket.on('chat:read', async (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) return;
      await prisma.conversationMember
        .update({
          where: { conversationId_userId: { conversationId, userId: me.userId } },
          data: { lastReadAt: new Date() },
        })
        .catch(() => undefined);
      socket.to(`conversation:${conversationId}`).emit('chat:read', {
        conversationId,
        userId: me.userId,
        readAt: new Date(),
      });
    });

    // ---- Disconnect --------------------------------------------------------
    // `disconnecting` fires while the socket still has its rooms, unlike
    // `disconnect`.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('conversation:')) {
          socket.to(room).emit('presence:left', {
            conversationId: room.replace('conversation:', ''),
            userId: me.userId,
          });
        }
      }
    });

    socket.on('disconnect', () => {
      setImmediate(async () => {
        const ids = new Set<string>();
        for (const s of io.sockets.sockets.values()) {
          const id = (s.data as SocketData).userId;
          if (id) ids.add(id);
        }
        const users = await prisma.user.findMany({
          where: { id: { in: [...ids] } },
          select: publicUserSelect,
          orderBy: { lastSeenAt: 'desc' },
        });
        broadcast('presence:online', users.map((u) => ({ ...serializeUser(u), isOnline: true })));
      });
    });
  });

  setIo(io);
  return io;
}