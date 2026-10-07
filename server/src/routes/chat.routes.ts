import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { created, noContent, ok } from '../lib/http.js';
import { validateBody, validateQuery, getQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { publicUserSelect, serializeUser } from '../serializers/index.js';

const router = Router();

const conversationInclude = {
  members: { select: { userId: true, lastReadAt: true, user: { select: publicUserSelect } } },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, content: true, createdAt: true, senderId: true, isDeleted: true },
  },
} as const;

async function countUnread(conversationId: string, userId: string, lastReadAt: Date | null) {
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      createdAt: { gt: lastReadAt ?? new Date(0) },
      isDeleted: false,
    },
  });
}

async function assertMember(conversationId: string, userId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { conversationId: true },
  });
  if (!member) throw HttpError.forbidden('คุณไม่ได้อยู่ในห้องนี้');
}

function shapeConversation(row: { id: string; title: string | null; isDirect: boolean; createdAt: Date; members: Array<{ userId: string; lastReadAt: Date | null; user: Parameters<typeof serializeUser>[0] }>; messages: Array<{ id: string; content: string; createdAt: Date; senderId: string; isDeleted: boolean }> }, viewerId: string, unreadCount: number) {
  const others = row.members.filter((m) => m.userId !== viewerId).map((m) => m.user);
  const last = row.messages[0];
  return {
    id: row.id,
    title: row.isDirect ? (others[0]?.displayName ?? 'แชทส่วนตัว') : (row.title ?? 'ห้องสนทนา'),
    isDirect: row.isDirect,
    memberCount: row.members.length,
    participants: others.map(serializeUser),
    lastMessage: last
      ? {
          id: last.id,
          content: last.isDeleted ? 'ข้อความถูกลบ' : last.content,
          createdAt: last.createdAt,
          senderId: last.senderId,
          isMine: last.senderId === viewerId,
        }
      : null,
    unreadCount,
    createdAt: row.createdAt,
  };
}

/** GET /api/chat/conversations - every room the caller belongs to. */
router.get(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.conversation.findMany({
      where: { members: { some: { userId: req.user!.id } } },
      include: conversationInclude,
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const unreadCounts = await Promise.all(
      rows.map((row) =>
        countUnread(row.id, req.user!.id, row.members.find((m) => m.userId === req.user!.id)?.lastReadAt ?? null),
      ),
    );

    return ok(res, rows.map((row, i) => shapeConversation(row, req.user!.id, unreadCounts[i] ?? 0)));
  }),
);

/** POST /api/chat/conversations - open (or reuse) a 1:1 DM, or create a named room. */
router.post(
  '/conversations',
  requireAuth,
  validateBody(
    z.object({
      participantId: z.string().trim().optional(),
      title: z.string().trim().min(2).max(80).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { participantId, title } = req.body as { participantId?: string; title?: string };

    if (!participantId) {
      if (!title) throw HttpError.badRequest('ต้องระบุผู้สนทนาหรือชื่อห้อง');
      const conversation = await prisma.conversation.create({
        data: { title, isDirect: false, members: { create: [{ userId: req.user!.id }] } },
      });
      return created(res, {
        id: conversation.id,
        title: conversation.title,
        isDirect: false,
        memberCount: 1,
        participants: [],
        lastMessage: null,
        unreadCount: 0,
        createdAt: conversation.createdAt,
      });
    }

    if (participantId === req.user!.id) throw HttpError.badRequest('ส่งข้อความหาตัวเองไม่ได้');

    const other = await prisma.user.findUnique({
      where: { id: participantId },
      select: publicUserSelect,
    });
    if (!other) throw HttpError.notFound('ไม่พบผู้ใช้');

    const existing = await prisma.conversation.findFirst({
      where: {
        isDirect: true,
        AND: [
          { members: { some: { userId: req.user!.id } } },
          { members: { some: { userId: participantId } } },
        ],
      },
      include: conversationInclude,
    });

    if (existing) {
      return ok(res, shapeConversation(existing, req.user!.id, 0));
    }

    const conversation = await prisma.conversation.create({
      data: {
        isDirect: true,
        members: { create: [{ userId: req.user!.id }, { userId: participantId }] },
      },
    });

    return created(res, {
      id: conversation.id,
      title: other.displayName,
      isDirect: true,
      memberCount: 2,
      participants: [serializeUser(other)],
      lastMessage: null,
      unreadCount: 0,
      createdAt: conversation.createdAt,
    });
  }),
);

/** GET /api/chat/conversations/:id/messages - newest-last page, cursor by `before`. */
router.get(
  '/conversations/:id/messages',
  requireAuth,
  validateQuery(
    z.object({
      before: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(40),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { before, limit } = getQuery<{ before?: string; limit: number }>(req);
    await assertMember(req.params.id, req.user!.id);

    const rows = await prisma.message.findMany({
      where: {
        conversationId: req.params.id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { sender: { select: publicUserSelect } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = rows.reverse().map((m) => ({
      id: m.id,
      content: m.isDeleted ? 'ข้อความถูกลบ' : m.content,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      isMine: m.senderId === req.user!.id,
      sender: serializeUser(m.sender),
    }));

    return ok(res, {
      items,
      nextCursor: rows.length === limit ? rows[0].createdAt.toISOString() : null,
    });
  }),
);

/** POST /api/chat/conversations/:id/messages - REST fallback when sockets are blocked. */
router.post(
  '/conversations/:id/messages',
  requireAuth,
  writeLimiter,
  validateBody(z.object({ content: z.string().trim().min(1, 'กรุณาพิมพ์ข้อความ').max(4000) })),
  asyncHandler(async (req, res) => {
    const { content } = req.body as { content: string };
    await assertMember(req.params.id, req.user!.id);

    const message = await prisma.message.create({
      data: { content, conversationId: req.params.id, senderId: req.user!.id },
      include: { sender: { select: publicUserSelect } },
    });
    await prisma.conversation.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });

    return created(res, {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      isMine: true,
      sender: serializeUser(message.sender),
    });
  }),
);

/** POST /api/chat/conversations/:id/read */
router.post(
  '/conversations/:id/read',
  requireAuth,
  validateBody(z.object({ conversationId: z.string().trim() })),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.body as { conversationId: string };
    await assertMember(conversationId, req.user!.id);
    const membership = await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: req.user!.id } },
      data: { lastReadAt: new Date() },
      select: { lastReadAt: true },
    });
    return ok(res, { conversationId, readAt: membership.lastReadAt });
  }),
);

/** POST /api/chat/conversations/:id/members - invite someone into a room. */
router.post(
  '/conversations/:id/members',
  requireAuth,
  validateBody(z.object({ userId: z.string().trim() })),
  asyncHandler(async (req, res) => {
    const { userId } = req.body as { userId: string };
    await assertMember(req.params.id, req.user!.id);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw HttpError.notFound('ไม่พบผู้ใช้');

    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: req.params.id, userId } },
      create: { conversationId: req.params.id, userId },
      update: {},
    });
    return created(res, { conversationId: req.params.id, userId });
  }),
);

/** DELETE /api/chat/conversations/:id/members/me - leave a room. */
router.delete(
  '/conversations/:id/members/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.conversationMember
      .delete({
        where: { conversationId_userId: { conversationId: req.params.id, userId: req.user!.id } },
      })
      .catch(() => undefined);
    return noContent(res);
  }),
);

export default router;