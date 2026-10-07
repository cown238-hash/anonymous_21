import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { publicUserSelect, serializeUser } from '../serializers/index.js';
import { broadcast, emitToUser, setIo, userRoom } from './emitter.js';

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
        for (const r of recipients) {
          const convo = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { title: true, isDirect: true },
          });
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