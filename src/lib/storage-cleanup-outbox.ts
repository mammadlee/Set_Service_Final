import { Prisma } from '@prisma/client';
import { deleteStoredObject, ObjectVisibility } from './uploads';

export const STORAGE_CLEANUP_EVENT_TYPE = 'privacy.storage.delete';

export interface StorageCleanupRequest {
  key: string;
  visibility: ObjectVisibility;
}

export interface EnqueueStorageCleanupInput {
  aggregate: 'worker' | 'worker_document' | 'company_document';
  aggregateId: string;
  reason:
    | 'worker_account_deletion'
    | 'worker_document_owner_deletion'
    | 'worker_document_replaced'
    | 'company_document_replaced';
  objects: readonly StorageCleanupRequest[];
}

/**
 * Enqueue object deletion in the same database transaction as the privacy
 * mutation. Provider failures are then retried by the outbox worker instead of
 * being swallowed after the database has already committed.
 */
export async function enqueueStorageCleanupEvents(
  tx: Prisma.TransactionClient,
  input: EnqueueStorageCleanupInput,
): Promise<number> {
  const uniqueObjects = [
    ...new Map(
      input.objects.map((object) => [`${object.visibility}:${object.key}`, object]),
    ).values(),
  ];
  if (uniqueObjects.length === 0) return 0;

  const result = await tx.outboxEvent.createMany({
    data: uniqueObjects.map((object) => ({
      aggregate: input.aggregate,
      aggregate_id: input.aggregateId,
      event_type: STORAGE_CLEANUP_EVENT_TYPE,
      payload: {
        key: object.key,
        visibility: object.visibility,
        reason: input.reason,
      } as Prisma.InputJsonValue,
    })),
  });

  return result.count;
}

export async function deliverStorageCleanupOutboxEvent(
  rawPayload: Prisma.JsonValue,
  deleteObject: typeof deleteStoredObject = deleteStoredObject,
): Promise<void> {
  const payload = asObject(rawPayload);
  const key = parseStorageObjectKey(payload.key);
  const visibility = parseObjectVisibility(payload.visibility);
  await deleteObject(key, visibility);
}

function asObject(value: Prisma.JsonValue): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Storage cleanup outbox payload must be an object');
  }
  return value as Prisma.JsonObject;
}

function parseStorageObjectKey(value: Prisma.JsonValue | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 1_024) {
    throw new Error('Storage cleanup outbox payload has an invalid object key');
  }
  return value;
}

function parseObjectVisibility(value: Prisma.JsonValue | undefined): ObjectVisibility {
  if (value === 'public' || value === 'private') return value;
  throw new Error('Storage cleanup outbox payload has an invalid visibility');
}
