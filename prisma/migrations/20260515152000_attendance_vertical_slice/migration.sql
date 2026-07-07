ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'attendance_checked_in';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'attendance_checked_out';

ALTER TABLE "attendance_logs"
  ADD COLUMN IF NOT EXISTS "checkin_location" JSONB,
  ADD COLUMN IF NOT EXISTS "checkout_location" JSONB,
  ADD COLUMN IF NOT EXISTS "checkin_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "checkout_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "qr_token_hash" TEXT;

CREATE INDEX IF NOT EXISTS "attendance_logs_assignment_id_checkout_time_idx"
  ON "attendance_logs"("assignment_id", "checkout_time");

CREATE INDEX IF NOT EXISTS "attendance_logs_created_at_idx"
  ON "attendance_logs"("created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_logs_one_open_per_assignment_idx"
  ON "attendance_logs"("assignment_id")
  WHERE "checkout_time" IS NULL AND "deleted_at" IS NULL;
