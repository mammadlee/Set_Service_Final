-- Contract the legacy order lifecycle into the explicit state machine. The
-- snapshot is retained long enough to write a deterministic history entry.
CREATE TEMP TABLE "_order_lifecycle_backfill" ON COMMIT DROP AS
SELECT
  o."id",
  o."status" AS "from_status",
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "attendance_logs" al
      JOIN "assignments" a ON a."id" = al."assignment_id"
      WHERE a."order_id" = o."id"
        AND a."deleted_at" IS NULL
        AND al."deleted_at" IS NULL
        AND al."checkin_time" IS NOT NULL
        AND al."checkout_time" IS NULL
    ) THEN 'in_progress'::"OrderStatus"
    WHEN EXISTS (
      SELECT 1 FROM "assignments" a
      WHERE a."order_id" = o."id"
        AND a."deleted_at" IS NULL
        AND a."status" = 'completed'
    ) AND NOT EXISTS (
      SELECT 1 FROM "assignments" a
      WHERE a."order_id" = o."id"
        AND a."deleted_at" IS NULL
        AND a."status" IN ('assigned', 'accepted')
    ) THEN 'completed'::"OrderStatus"
    WHEN (
      SELECT COUNT(*) FROM "assignments" a
      WHERE a."order_id" = o."id"
        AND a."deleted_at" IS NULL
        AND a."status" IN ('assigned', 'accepted', 'completed')
    ) >= o."required_count" THEN 'assigned'::"OrderStatus"
    WHEN EXISTS (
      SELECT 1 FROM "assignments" a
      WHERE a."order_id" = o."id"
        AND a."deleted_at" IS NULL
        AND a."status" IN ('assigned', 'accepted', 'completed')
    ) THEN 'partially_assigned'::"OrderStatus"
    ELSE 'published'::"OrderStatus"
  END AS "to_status",
  o."version" + 1 AS "new_version"
FROM "orders" o
WHERE o."deleted_at" IS NULL
  AND o."status" = 'active';

UPDATE "orders" o
SET
  "status" = b."to_status",
  "version" = b."new_version",
  "updated_at" = CURRENT_TIMESTAMP
FROM "_order_lifecycle_backfill" b
WHERE o."id" = b."id";

INSERT INTO "order_status_history" (
  "id", "order_id", "from_status", "to_status", "actor_id",
  "actor_role", "reason", "version", "created_at"
)
SELECT
  'fsm-backfill-' || b."id",
  b."id",
  b."from_status",
  b."to_status",
  NULL,
  'admin'::"Role",
  'legacy_active_backfill',
  b."new_version",
  CURRENT_TIMESTAMP
FROM "_order_lifecycle_backfill" b;

-- Persist every signed QR grant and consume it once per worker. Venue QR codes
-- remain usable by multiple workers, and the same frame may legitimately be
-- used once for check-in and once for check-out. A repeated/concurrent use of
-- the same action is rejected by the action-scoped unique constraint.
CREATE TABLE "attendance_qr_tokens" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "assignment_id" TEXT,
  "order_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "kiosk_id" TEXT,
  "kiosk_session_id" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "attendance_qr_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_qr_tokens_token_hash_key"
ON "attendance_qr_tokens"("token_hash");
CREATE UNIQUE INDEX "attendance_qr_tokens_nonce_key"
ON "attendance_qr_tokens"("nonce");
CREATE INDEX "attendance_qr_tokens_order_id_revoked_at_idx"
ON "attendance_qr_tokens"("order_id", "revoked_at");
CREATE INDEX "attendance_qr_tokens_assignment_id_revoked_at_idx"
ON "attendance_qr_tokens"("assignment_id", "revoked_at");
CREATE INDEX "attendance_qr_tokens_kiosk_id_kiosk_session_id_idx"
ON "attendance_qr_tokens"("kiosk_id", "kiosk_session_id");
CREATE INDEX "attendance_qr_tokens_expires_at_idx"
ON "attendance_qr_tokens"("expires_at");

CREATE TABLE "attendance_qr_uses" (
  "id" TEXT NOT NULL,
  "qr_token_id" TEXT NOT NULL,
  "worker_id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_qr_uses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_qr_uses_action_check" CHECK ("action" IN ('checkin', 'checkout')),
  CONSTRAINT "attendance_qr_uses_qr_token_id_fkey"
    FOREIGN KEY ("qr_token_id") REFERENCES "attendance_qr_tokens"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "attendance_qr_uses_qr_token_id_worker_id_action_key"
ON "attendance_qr_uses"("qr_token_id", "worker_id", "action");
CREATE INDEX "attendance_qr_uses_worker_id_used_at_idx"
ON "attendance_qr_uses"("worker_id", "used_at");
CREATE INDEX "attendance_qr_uses_assignment_id_used_at_idx"
ON "attendance_qr_uses"("assignment_id", "used_at");

-- Repair any pre-existing double activation before enforcing the invariant.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "kiosk_id"
      ORDER BY "activated_at" DESC, "created_at" DESC, "id" DESC
    ) AS rn
  FROM "kiosk_active_sessions"
  WHERE "status" = 'active'
    AND "revoked_at" IS NULL
    AND "deleted_at" IS NULL
)
UPDATE "kiosk_active_sessions" s
SET
  "status" = 'revoked',
  "revoked_at" = CURRENT_TIMESTAMP,
  "updated_at" = CURRENT_TIMESTAMP
FROM ranked r
WHERE s."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX "kiosk_active_sessions_one_active_per_kiosk_idx"
ON "kiosk_active_sessions"("kiosk_id")
WHERE "status" = 'active'
  AND "revoked_at" IS NULL
  AND "deleted_at" IS NULL;
