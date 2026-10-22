-- Expand-only order state-machine and delivery hardening.
-- Legacy "active" remains valid during the compatibility window; no existing
-- order rows are rewritten by this migration.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'published';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'partially_assigned';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'in_progress';

CREATE TYPE "IdempotencyStatus" AS ENUM ('pending', 'completed');

ALTER TABLE "orders"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "idempotency_keys"
ADD COLUMN "status" "IdempotencyStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "completed_at" TIMESTAMP(3);

UPDATE "idempotency_keys"
SET
  "status" = 'completed',
  "completed_at" = COALESCE("updated_at", "created_at")
WHERE "status_code" IS NOT NULL
  AND "response" IS NOT NULL;

CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_id" TEXT,
    "actor_role" "Role" NOT NULL,
    "reason" TEXT,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idempotency_keys_status_expires_at_idx"
ON "idempotency_keys"("status", "expires_at");

DROP INDEX IF EXISTS "outbox_events_status_available_at_idx";
CREATE INDEX "outbox_events_status_available_at_created_at_idx"
ON "outbox_events"("status", "available_at", "created_at");

CREATE INDEX "outbox_events_status_updated_at_idx"
ON "outbox_events"("status", "updated_at");

CREATE INDEX "order_status_history_order_id_created_at_idx"
ON "order_status_history"("order_id", "created_at");

CREATE INDEX "order_status_history_actor_id_created_at_idx"
ON "order_status_history"("actor_id", "created_at");

CREATE INDEX "order_status_history_to_status_created_at_idx"
ON "order_status_history"("to_status", "created_at");

ALTER TABLE "order_status_history"
ADD CONSTRAINT "order_status_history_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_status_history"
ADD CONSTRAINT "order_status_history_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
