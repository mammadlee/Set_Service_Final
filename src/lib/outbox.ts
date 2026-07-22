import { Prisma } from '@prisma/client';
import { deliverPushToRole, deliverPushToUsers, PushPayload } from './fcm';
import { logger } from './logger';
import { prisma } from './prisma';
import { Role } from '../types/prisma';
import { cleanupExpiredIdempotencyKeys } from './idempotency';
import { deliverProviderOutboxEvent } from './provider-outbox';
import { isPermanentProviderError } from './provider-http';
import { getRedisClient } from './redis';
import { deliverStorageCleanupOutboxEvent } from './storage-cleanup-outbox';

const MAX_ATTEMPTS = 10;
const STALE_CLAIM_MS = 5 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5_000;
const IDEMPOTENCY_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_HEARTBEAT_TTL_SECONDS = 30;
const DEFAULT_FAILURE_THRESHOLD = 5;

export const OUTBOX_HEARTBEAT_KEY = 'setservice:outbox:worker:heartbeat:v1';

export interface OutboxProcessorOptions {
  failureThreshold?: number;
  onUnhealthy?: (error: Error) => void;
  unrefTimer?: boolean;
}

export interface OutboxProcessorHealth {
  running: boolean;
  healthy: boolean;
  consecutiveFailures: number;
  failureThreshold: number;
  successfulBatches: number;
  failedBatches: number;
  processedEvents: number;
  pendingEvents: number;
  deadEvents: number;
  lastBatchDeliveryFailures: number;
  lastBatchDurationMs: number;
  startedAt: string | null;
  lastBatchStartedAt: string | null;
  lastSuccessfulBatchAt: string | null;
  lastFailedBatchAt: string | null;
}

let timer: NodeJS.Timeout | null = null;
let activeBatch: Promise<number> | null = null;
let lastIdempotencyCleanupAt = 0;
let fatalFailureNotified = false;
let processorOptions: Required<Pick<OutboxProcessorOptions, 'failureThreshold' | 'unrefTimer'>>
  & Pick<OutboxProcessorOptions, 'onUnhealthy'> = {
    failureThreshold: DEFAULT_FAILURE_THRESHOLD,
    unrefTimer: true,
  };
const processorState = {
  running: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  startedAt: 0,
  lastBatchStartedAt: 0,
  lastSuccessfulBatchAt: 0,
  lastFailedBatchAt: 0,
  consecutiveFailures: 0,
  successfulBatches: 0,
  failedBatches: 0,
  processedEvents: 0,
  pendingEvents: 0,
  deadEvents: 0,
  lastBatchDeliveryFailures: 0,
  lastBatchDurationMs: 0,
};

export function startOutboxProcessor(
  intervalMs = DEFAULT_INTERVAL_MS,
  options: OutboxProcessorOptions = {},
): void {
  if (timer) return;
  processorOptions = {
    failureThreshold: normalizePositiveInteger(
      options.failureThreshold,
      DEFAULT_FAILURE_THRESHOLD,
    ),
    unrefTimer: options.unrefTimer ?? true,
    onUnhealthy: options.onUnhealthy,
  };
  processorState.running = true;
  processorState.intervalMs = normalizePositiveInteger(intervalMs, DEFAULT_INTERVAL_MS);
  processorState.startedAt = Date.now();
  processorState.consecutiveFailures = 0;
  fatalFailureNotified = false;

  void runScheduledBatch();
  timer = setInterval(() => void runScheduledBatch(), processorState.intervalMs);
  if (processorOptions.unrefTimer) timer.unref();
}

export async function stopOutboxProcessor(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  processorState.running = false;
  const batch = activeBatch;
  if (batch) await batch;
}

export function processOutboxBatch(limit = 20): Promise<number> {
  if (activeBatch) return Promise.resolve(0);
  const batch = runOutboxBatch(limit);
  activeBatch = batch;
  void batch.finally(() => {
    if (activeBatch === batch) activeBatch = null;
  }).catch(() => undefined);
  return batch;
}

async function runOutboxBatch(limit: number): Promise<number> {
  const batchStartedAt = Date.now();
  processorState.lastBatchStartedAt = batchStartedAt;

  try {
    const now = new Date();
    if (now.getTime() - lastIdempotencyCleanupAt >= IDEMPOTENCY_CLEANUP_INTERVAL_MS) {
      try {
        await cleanupExpiredIdempotencyKeys(now);
        lastIdempotencyCleanupAt = now.getTime();
      } catch (error) {
        logger.warn('Expired idempotency cleanup failed', {
          error: safeErrorMessage(error),
        });
      }
    }

    await prisma.outboxEvent.updateMany({
      where: {
        status: 'processing',
        updated_at: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
      },
      data: { status: 'pending', available_at: now },
    });

    const candidates = await prisma.outboxEvent.findMany({
      where: { status: 'pending', available_at: { lte: now } },
      orderBy: { created_at: 'asc' },
      take: limit,
    });

    let processed = 0;
    let deliveryFailures = 0;
    for (const event of candidates) {
      const claim = await prisma.outboxEvent.updateMany({
        where: { id: event.id, status: 'pending' },
        data: { status: 'processing' },
      });
      if (claim.count !== 1) continue;

      try {
        await dispatchEvent(event.id, event.event_type, event.payload);
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'processed',
            processed_at: new Date(),
            last_error: null,
          },
        });
        processed += 1;
      } catch (error) {
        deliveryFailures += 1;
        const attempts = event.attempts + 1;
        const dead = isPermanentProviderError(error) || attempts >= MAX_ATTEMPTS;
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: dead ? 'dead' : 'pending',
            attempts,
            available_at: new Date(Date.now() + retryDelayMs(attempts)),
            last_error: safeErrorMessage(error),
          },
        });
        logger.warn('Outbox delivery failed', {
          event_id: event.id,
          event_type: event.event_type,
          attempts,
          terminal: dead,
        });
      }
    }

    const [pendingEvents, deadEvents] = await Promise.all([
      prisma.outboxEvent.count({
        where: { status: { in: ['pending', 'processing'] } },
      }),
      prisma.outboxEvent.count({ where: { status: 'dead' } }),
    ]);
    processorState.pendingEvents = pendingEvents;
    processorState.deadEvents = deadEvents;
    processorState.processedEvents += processed;

    if (deliveryFailures > 0) {
      processorState.lastBatchDeliveryFailures = deliveryFailures;
      processorState.failedBatches += 1;
      processorState.consecutiveFailures += 1;
      processorState.lastFailedBatchAt = Date.now();
    } else {
      processorState.successfulBatches += 1;
      processorState.lastSuccessfulBatchAt = Date.now();
      // A failed delivery remains a readiness failure while it is waiting for
      // retry. Clear it only after a later event succeeds or the queue is fully
      // drained without dead letters.
      if (processed > 0 || (pendingEvents === 0 && deadEvents === 0)) {
        processorState.lastBatchDeliveryFailures = 0;
        processorState.consecutiveFailures = 0;
        fatalFailureNotified = false;
      }
    }

    await publishWorkerHeartbeat(getOutboxProcessorHealth().healthy);
    return processed;
  } catch (error) {
    processorState.failedBatches += 1;
    processorState.consecutiveFailures += 1;
    processorState.lastFailedBatchAt = Date.now();
    logger.error('Outbox batch failed', { error: safeErrorMessage(error) });
    return 0;
  } finally {
    processorState.lastBatchDurationMs = Math.max(0, Date.now() - batchStartedAt);
  }
}

export function getOutboxProcessorHealth(now = Date.now()): OutboxProcessorHealth {
  const startupGraceMs = Math.max(10_000, processorState.intervalMs * 2);
  const staleAfterMs = Math.max(
    processorState.intervalMs * 3,
    getOutboxHeartbeatTtlSeconds() * 1_000,
  );
  const hasRecentSuccess = processorState.lastSuccessfulBatchAt > 0
    ? now - processorState.lastSuccessfulBatchAt <= staleAfterMs
    : processorState.startedAt > 0 && now - processorState.startedAt <= startupGraceMs;
  const healthy = processorState.running
    && hasRecentSuccess
    && processorState.consecutiveFailures < processorOptions.failureThreshold
    && isOutboxDeliveryStateHealthy(processorState);

  return {
    running: processorState.running,
    healthy,
    consecutiveFailures: processorState.consecutiveFailures,
    failureThreshold: processorOptions.failureThreshold,
    successfulBatches: processorState.successfulBatches,
    failedBatches: processorState.failedBatches,
    processedEvents: processorState.processedEvents,
    pendingEvents: processorState.pendingEvents,
    deadEvents: processorState.deadEvents,
    lastBatchDeliveryFailures: processorState.lastBatchDeliveryFailures,
    lastBatchDurationMs: processorState.lastBatchDurationMs,
    startedAt: toIso(processorState.startedAt),
    lastBatchStartedAt: toIso(processorState.lastBatchStartedAt),
    lastSuccessfulBatchAt: toIso(processorState.lastSuccessfulBatchAt),
    lastFailedBatchAt: toIso(processorState.lastFailedBatchAt),
  };
}

export function isOutboxDeliveryStateHealthy(state: {
  lastBatchDeliveryFailures: number;
  deadEvents: number;
}): boolean {
  return state.lastBatchDeliveryFailures === 0 && state.deadEvents === 0;
}

export function renderOutboxMetrics(now = Date.now()): string {
  const health = getOutboxProcessorHealth(now);
  const timestampSeconds = (value: string | null): number =>
    value ? Date.parse(value) / 1_000 : 0;

  return [
    '# HELP setservice_outbox_processor_healthy Whether the outbox processor is healthy.',
    '# TYPE setservice_outbox_processor_healthy gauge',
    `setservice_outbox_processor_healthy ${health.healthy ? 1 : 0}`,
    '# HELP setservice_outbox_consecutive_failures Consecutive failed outbox batches.',
    '# TYPE setservice_outbox_consecutive_failures gauge',
    `setservice_outbox_consecutive_failures ${health.consecutiveFailures}`,
    '# HELP setservice_outbox_batches_total Outbox batches by result.',
    '# TYPE setservice_outbox_batches_total counter',
    `setservice_outbox_batches_total{result="success"} ${health.successfulBatches}`,
    `setservice_outbox_batches_total{result="failure"} ${health.failedBatches}`,
    '# HELP setservice_outbox_events_processed_total Successfully delivered outbox events.',
    '# TYPE setservice_outbox_events_processed_total counter',
    `setservice_outbox_events_processed_total ${health.processedEvents}`,
    '# HELP setservice_outbox_queue_events Current outbox queue depth by state.',
    '# TYPE setservice_outbox_queue_events gauge',
    `setservice_outbox_queue_events{state="pending"} ${health.pendingEvents}`,
    `setservice_outbox_queue_events{state="dead"} ${health.deadEvents}`,
    '# HELP setservice_outbox_last_batch_delivery_failures Failed event deliveries in the latest delivery-attempting batch.',
    '# TYPE setservice_outbox_last_batch_delivery_failures gauge',
    `setservice_outbox_last_batch_delivery_failures ${health.lastBatchDeliveryFailures}`,
    '# HELP setservice_outbox_last_batch_duration_milliseconds Last batch duration.',
    '# TYPE setservice_outbox_last_batch_duration_milliseconds gauge',
    `setservice_outbox_last_batch_duration_milliseconds ${health.lastBatchDurationMs}`,
    '# HELP setservice_outbox_last_success_unixtime_seconds Last successful batch time.',
    '# TYPE setservice_outbox_last_success_unixtime_seconds gauge',
    `setservice_outbox_last_success_unixtime_seconds ${timestampSeconds(health.lastSuccessfulBatchAt)}`,
    '',
  ].join('\n');
}

export function isOutboxHeartbeatFresh(raw: string | null, now = Date.now()): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { timestamp?: unknown; healthy?: unknown };
    if (parsed.healthy !== true || typeof parsed.timestamp !== 'string') return false;
    const timestamp = Date.parse(parsed.timestamp);
    return Number.isFinite(timestamp)
      && timestamp <= now + 5_000
      && now - timestamp <= getOutboxHeartbeatTtlSeconds() * 1_000;
  } catch {
    return false;
  }
}

async function runScheduledBatch(): Promise<void> {
  const failuresBefore = processorState.failedBatches;
  await processOutboxBatch();
  const batchFailed = processorState.failedBatches > failuresBefore;
  if (
    batchFailed
    && processorState.consecutiveFailures >= processorOptions.failureThreshold
    && !fatalFailureNotified
  ) {
    fatalFailureNotified = true;
    const error = new Error(
      `Outbox processor reached ${processorState.consecutiveFailures} consecutive batch failures.`,
    );
    logger.error('Outbox processor is unhealthy and requires restart', {
      consecutive_failures: processorState.consecutiveFailures,
      failure_threshold: processorOptions.failureThreshold,
    });
    processorOptions.onUnhealthy?.(error);
  }
}

async function publishWorkerHeartbeat(healthy: boolean): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const timestamp = new Date().toISOString();
  await redis.set(
    OUTBOX_HEARTBEAT_KEY,
    JSON.stringify({ healthy, timestamp }),
    'EX',
    getOutboxHeartbeatTtlSeconds(),
  );
}

function getOutboxHeartbeatTtlSeconds(): number {
  return normalizePositiveInteger(
    Number(process.env.OUTBOX_HEARTBEAT_TTL_SECONDS),
    DEFAULT_HEARTBEAT_TTL_SECONDS,
  );
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function toIso(timestamp: number): string | null {
  return timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

async function dispatchEvent(
  eventId: string,
  eventType: string,
  rawPayload: Prisma.JsonValue
): Promise<void> {
  if (eventType === 'provider.sms.send' || eventType === 'provider.email.send') {
    await deliverProviderOutboxEvent(eventId, eventType, rawPayload);
    return;
  }

  if (eventType === 'privacy.storage.delete') {
    await deliverStorageCleanupOutboxEvent(rawPayload);
    return;
  }

  const payload = asObject(rawPayload);
  const message = parsePushPayload(payload);

  if (eventType === 'order.created') {
    const role = parseRole(payload.role);
    await deliverPushToRole(role, message);
    return;
  }

  if (eventType === 'order.cancelled') {
    const userIds = Array.isArray(payload.user_ids)
      ? payload.user_ids.filter((item): item is string => typeof item === 'string')
      : [];
    await deliverPushToUsers(userIds, message);
    return;
  }

  throw new Error(`Unsupported outbox event type: ${eventType}`);
}

function parsePushPayload(payload: Prisma.JsonObject): PushPayload {
  if (typeof payload.title !== 'string' || typeof payload.body !== 'string') {
    throw new Error('Outbox push payload is missing title/body');
  }

  return {
    title: payload.title,
    body: payload.body,
    data: payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? Object.fromEntries(
          Object.entries(payload.data).filter(([, value]) =>
            value === null || ['string', 'number', 'boolean'].includes(typeof value)
          )
        ) as PushPayload['data']
      : undefined,
  };
}

function asObject(value: Prisma.JsonValue): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Outbox payload must be an object');
  }
  return value as Prisma.JsonObject;
}

function parseRole(value: Prisma.JsonValue | undefined): Role {
  if (value === 'super_admin' || value === 'admin' || value === 'company' || value === 'worker') {
    return value;
  }
  throw new Error('Outbox payload has an invalid role');
}

function retryDelayMs(attempt: number): number {
  return Math.min(60 * 60 * 1000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 500);
  return String(error).slice(0, 500);
}
