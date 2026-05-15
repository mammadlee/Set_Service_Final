import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';

export async function listNotifications(userId: string, query: {
  page?: number;
  limit?: number;
  unread_only?: boolean;
}) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const where: Record<string, unknown> = {
    recipient_id: userId,
    deleted_at: null,
  };
  if (query.unread_only) where.read_at = null;

  const [total, data] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { created_at: 'desc' },
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
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.deleted_at) {
    throw Errors.notFound('Notification not found.', 'NOTIFICATION_NOT_FOUND');
  }
  if (notification.recipient_id !== userId) {
    throw Errors.forbidden('You can only update your own notifications.', 'NOTIFICATION_FORBIDDEN');
  }

  return prisma.notification.update({
    where: { id },
    data: { read_at: notification.read_at ?? new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { recipient_id: userId, read_at: null, deleted_at: null },
    data: { read_at: new Date() },
  });
  return { updated: result.count };
}
