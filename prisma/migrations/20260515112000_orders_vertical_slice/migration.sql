ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'order_created';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'order_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'order_cancelled';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "location" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pay_rate" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "orders_company_id_created_at_idx" ON "orders"("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "orders_category_status_idx" ON "orders"("category", "status");
