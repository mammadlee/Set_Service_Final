-- Keep the live attendance monitor sortable with indexed assignment-level
-- timestamps. Existing attendance data is backfilled without deleting or
-- rewriting attendance logs.
ALTER TABLE "assignments"
  ADD COLUMN "attendance_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "last_checkin_at" TIMESTAMP(3),
  ADD COLUMN "last_checkout_at" TIMESTAMP(3);

WITH attendance_activity AS (
  SELECT
    "assignment_id",
    MAX("checkin_time") AS "last_checkin_at",
    MAX("checkout_time") AS "last_checkout_at",
    MAX("updated_at") AS "last_activity_at"
  FROM "attendance_logs"
  WHERE "deleted_at" IS NULL
  GROUP BY "assignment_id"
)
UPDATE "assignments" AS assignment
SET
  "last_checkin_at" = activity."last_checkin_at",
  "last_checkout_at" = activity."last_checkout_at",
  "attendance_activity_at" = GREATEST(
    assignment."assigned_at",
    COALESCE(activity."last_activity_at", assignment."assigned_at")
  )
FROM attendance_activity AS activity
WHERE activity."assignment_id" = assignment."id";

UPDATE "assignments"
SET "attendance_activity_at" = "assigned_at"
WHERE "last_checkin_at" IS NULL AND "last_checkout_at" IS NULL;

CREATE INDEX "assignments_attendance_activity_at_idx"
ON "assignments"("attendance_activity_at");

CREATE INDEX "assignments_last_checkin_at_idx"
ON "assignments"("last_checkin_at");

CREATE INDEX "assignments_last_checkout_at_idx"
ON "assignments"("last_checkout_at");
