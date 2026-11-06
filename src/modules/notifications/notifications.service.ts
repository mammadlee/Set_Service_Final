import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { NotificationListQuery } from './notifications.schema';

export async function listNotifications(userId: string, query: NotificationListQuery) {
  const { page, limit } = query;
  const where: Record<string, unknown> = {
    recipient_id: userId,
    deleted_at: null,
  };
  if (query.unread_only) where.read_at = null;

  const [total, data] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: [
        { created_at: 'desc' },
        { id: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data,
    meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

export async function markNotificationRead(userId: string, id: string) {
  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: {
      id,
      recipient_id: userId,
      deleted_at: null,
      read_at: null,
    },
    data: { read_at: now },
  });
  if (result.count === 1) {
    return prisma.notification.findFirstOrThrow({
      where: { id, recipient_id: userId, deleted_at: null },
    });
  }

  const existing = await prisma.notification.findFirst({
    where: { id, recipient_id: userId, deleted_at: null },
  });
  if (!existing) {
    throw Errors.notFound('Notification not found.', 'NOTIFICATION_NOT_FOUND');
  }
  return existing;
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { recipient_id: userId, read_at: null, deleted_at: null },
    data: { read_at: new Date() },
  });
  return { updated: result.count };
}
