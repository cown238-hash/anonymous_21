import { NotificationType, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../realtime/emitter.js';

export interface NotifyInput {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  payload?: Prisma.InputJsonValue;
}

/**
 * Persists a notification and pushes it over the socket.
 * Never throws - a failed notification must not break the main request.
 */
export async function notify(input: NotifyInput): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return;

  try {
    const row = await prisma.notification.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        payload: input.payload ?? undefined,
      },
    });
    emitToUser(input.userId, 'notification:new', {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.readAt,
      createdAt: row.createdAt,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] failed', err);
  }
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>) {
  await Promise.all(userIds.map((userId) => notify({ ...input, userId })));
}