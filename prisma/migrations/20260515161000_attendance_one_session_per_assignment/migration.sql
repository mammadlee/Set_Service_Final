-- MVP rule: one non-deleted attendance session per assignment.
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_logs_one_session_per_assignment_idx"
  ON "attendance_logs"("assignment_id")
  WHERE "deleted_at" IS NULL;
