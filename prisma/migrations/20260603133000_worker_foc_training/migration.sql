-- Add F.O.C. training marker for workers. This is admin-only metadata and is not exposed to company-safe profiles.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'worker_foc_training_added';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'worker_foc_training_removed';

ALTER TABLE "workers"
ADD COLUMN "is_foc_training" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "foc_training_note" TEXT,
ADD COLUMN "foc_training_updated_at" TIMESTAMP(3),
ADD COLUMN "foc_training_updated_by_id" TEXT;

CREATE INDEX "workers_is_foc_training_status_idx" ON "workers"("is_foc_training", "status");
CREATE INDEX "workers_foc_training_updated_by_id_idx" ON "workers"("foc_training_updated_by_id");

ALTER TABLE "workers"
ADD CONSTRAINT "workers_foc_training_updated_by_id_fkey"
FOREIGN KEY ("foc_training_updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
