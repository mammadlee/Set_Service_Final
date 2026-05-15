import { prisma } from './prisma';
import { NotificationChannel, NotificationType } from '../types/prisma';

export async function createNotification(input: {
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: unknown;
  channel?: NotificationChannel;
}) {
  return prisma.notification.create({
    data: {
      recipient_id: input.recipient_id,
      type: input.type,
      channel: input.channel ?? 'in_app',
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? {},
    },
  });
}
