ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'assignment_created';

ALTER TYPE "AssignmentStatus" RENAME TO "AssignmentStatus_old";

CREATE TYPE "AssignmentStatus" AS ENUM (
  'assigned',
  'accepted',
  'rejected',
  'completed',
  'cancelled'
);

ALTER TABLE "assignments"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "AssignmentStatus"
    USING (
      CASE
        WHEN "status"::text = 'pending' THEN 'assigned'
        ELSE "status"::text
      END
    )::"AssignmentStatus",
  ALTER COLUMN "status" SET DEFAULT 'assigned';

DROP TYPE "AssignmentStatus_old";
