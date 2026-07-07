DO $$
BEGIN
  CREATE TYPE "WorkerClass" AS ENUM ('A', 'B', 'C');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "workers"
  ADD COLUMN IF NOT EXISTS "worker_class" "WorkerClass";

ALTER TABLE "ratings"
  ADD COLUMN IF NOT EXISTS "assignment_id" TEXT;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'rating_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'worker_class_updated';

DO $$
BEGIN
  ALTER TABLE "ratings"
    ADD CONSTRAINT "ratings_assignment_id_fkey"
    FOREIGN KEY ("assignment_id")
    REFERENCES "assignments"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ratings_assignment_id_key"
  ON "ratings"("assignment_id");

CREATE INDEX IF NOT EXISTS "workers_worker_class_status_idx"
  ON "workers"("worker_class", "status");
