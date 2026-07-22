CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER,
    "response" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregate" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_keys_actor_id_scope_key_key"
ON "idempotency_keys"("actor_id", "scope", "key");

CREATE INDEX "idempotency_keys_expires_at_idx"
ON "idempotency_keys"("expires_at");

CREATE INDEX "outbox_events_status_available_at_idx"
ON "outbox_events"("status", "available_at");

CREATE INDEX "outbox_events_aggregate_aggregate_id_idx"
ON "outbox_events"("aggregate", "aggregate_id");
