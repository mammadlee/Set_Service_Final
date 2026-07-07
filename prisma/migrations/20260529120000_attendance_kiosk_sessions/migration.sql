CREATE TABLE IF NOT EXISTS "kiosk_sessions" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "created_by_id" TEXT,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "kiosk_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kiosk_sessions_token_hash_key" ON "kiosk_sessions"("token_hash");
CREATE INDEX IF NOT EXISTS "kiosk_sessions_assignment_id_revoked_at_idx" ON "kiosk_sessions"("assignment_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "kiosk_sessions_company_id_revoked_at_idx" ON "kiosk_sessions"("company_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "kiosk_sessions_order_id_idx" ON "kiosk_sessions"("order_id");
CREATE INDEX IF NOT EXISTS "kiosk_sessions_expires_at_idx" ON "kiosk_sessions"("expires_at");
CREATE INDEX IF NOT EXISTS "kiosk_sessions_deleted_at_idx" ON "kiosk_sessions"("deleted_at");

ALTER TABLE "kiosk_sessions"
  ADD CONSTRAINT "kiosk_sessions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kiosk_sessions"
  ADD CONSTRAINT "kiosk_sessions_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kiosk_sessions"
  ADD CONSTRAINT "kiosk_sessions_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kiosk_sessions"
  ADD CONSTRAINT "kiosk_sessions_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
