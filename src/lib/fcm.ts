import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { prisma } from './prisma';
import { logger } from './logger';
import { Role } from '../types/prisma';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null | undefined>;
}

export interface PushDeviceTarget {
  id: string;
  token: string;
}

interface PushProvider {
  sendToTokens(tokens: PushDeviceTarget[], payload: PushPayload): Promise<void>;
}

class DisabledPushProvider implements PushProvider {
  private warned = false;

  async sendToTokens(tokens: PushDeviceTarget[]): Promise<void> {
    if (tokens.length === 0 || this.warned) return;
    this.warned = true;
    logger.warn('Push notifications are disabled; skipping FCM delivery');
  }
}

class FirebasePushProvider implements PushProvider {
  constructor(private readonly messaging: Messaging) {}

  async sendToTokens(tokens: PushDeviceTarget[], payload: PushPayload): Promise<void> {
    if (tokens.length === 0) return;

    const result = await this.messaging.sendEachForMulticast({
      tokens: tokens.map((item) => item.token),
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: stringifyData(payload.data),
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
      apns: {
        payload: { aps: { sound: 'default' } },
      },
    });

    const invalidTokenIds: string[] = [];
    result.responses.forEach((response, index) => {
      if (!response.success && isInvalidRegistrationToken(response.error?.code)) {
        invalidTokenIds.push(tokens[index].id);
      }
    });

    if (invalidTokenIds.length > 0) {
      await prisma.deviceToken.updateMany({
        where: { id: { in: invalidTokenIds } },
        data: { revoked_at: new Date(), deleted_at: new Date() },
      });
      logger.info('Revoked invalid FCM tokens', { count: invalidTokenIds.length });
    }

    const failedCount = result.failureCount - invalidTokenIds.length;
    if (failedCount > 0) {
      logger.warn('Some FCM deliveries failed', { failed_count: failedCount });
    }
  }
}

let provider: PushProvider | null = null;
let missingConfigWarned = false;

export function assertPushConfiguration(): void {
  if (!isPushEnabled()) return;

  const missing = firebaseMissingVars();
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(`Push notifications are enabled but Firebase env vars are missing: ${missing.join(', ')}`);
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  await sendPushToUsers([userId], payload);
}

/**
 * Delivers one final, non-sensitive account-state notification to targets captured
 * in the same transaction that revoked them. This avoids reactivating a revoked
 * device record while ensuring the committed rejection is still communicated.
 */
export async function sendPushToDeviceTargets(
  targets: PushDeviceTarget[],
  payload: PushPayload,
): Promise<void> {
  const uniqueTargets = [
    ...new Map(
      targets
        .filter((target) => Boolean(target.id) && Boolean(target.token))
        .map((target) => [target.id, target]),
    ).values(),
  ];
  if (uniqueTargets.length === 0) return;

  try {
    await getPushProvider().sendToTokens(uniqueTargets, payload);
  } catch (error) {
    logger.warn('Direct push delivery skipped after non-fatal error', {
      target_count: uniqueTargets.length,
      ...pushErrorMeta(error),
    });
  }
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  try {
    await deliverPushToUsers(userIds, payload);
  } catch (error) {
    logger.warn('Push delivery skipped after non-fatal error', {
      ...pushErrorMeta(error),
    });
  }
}

export async function deliverPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return;

  const tokens = await prisma.deviceToken.findMany({
    where: {
      user_id: { in: uniqueUserIds },
      revoked_at: null,
      deleted_at: null,
      user: { is_active: true, deleted_at: null },
    },
    select: { id: true, token: true },
  });

  await getPushProvider().sendToTokens(tokens, payload);
}

export async function sendPushToRole(role: Role, payload: PushPayload): Promise<void> {
  try {
    await deliverPushToRole(role, payload);
  } catch (error) {
    logger.warn('Role push delivery skipped after non-fatal error', {
      role,
      ...pushErrorMeta(error),
    });
  }
}

export async function deliverPushToRole(role: Role, payload: PushPayload): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role, is_active: true, deleted_at: null },
    select: { id: true },
  });
  await deliverPushToUsers(users.map((user: { id: string }) => user.id), payload);
}

function getPushProvider(): PushProvider {
  if (provider) return provider;

  if (!isPushEnabled()) {
    provider = new DisabledPushProvider();
    return provider;
  }

  const missing = firebaseMissingVars();
  if (missing.length > 0) {
    if (!missingConfigWarned) {
      missingConfigWarned = true;
      logger.warn('Firebase env vars missing; push notifications disabled in this environment', {
        missing,
      });
    }
    provider = new DisabledPushProvider();
    return provider;
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }

  provider = new FirebasePushProvider(getMessaging());
  return provider;
}

function isPushEnabled(): boolean {
  return process.env.PUSH_NOTIFICATIONS_ENABLED === 'true';
}

function firebaseMissingVars(): string[] {
  return ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'].filter(
    (key) => !process.env[key]
  );
}

function stringifyData(data: PushPayload['data']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data ?? {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
}

function isInvalidRegistrationToken(code?: string): boolean {
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
}

function pushErrorMeta(error: unknown): Record<string, string> {
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; name?: unknown };
    return {
      error_name: typeof record.name === 'string' ? record.name : 'Error',
      error_code: typeof record.code === 'string' ? record.code : 'unknown',
    };
  }

  return { error_name: typeof error, error_code: 'unknown' };
}
