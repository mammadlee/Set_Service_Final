-- SET Service production preflight before applying:
-- prisma/migrations/20260515161000_attendance_one_session_per_assignment
--
-- Purpose:
-- The MVP enforces one non-deleted attendance session per assignment.
-- This check finds assignments that would violate the unique index.
--
-- Expected safe result: zero rows.
-- If rows are returned, review and manually clean/merge/archive duplicates
-- before running `prisma migrate deploy`. This script never destroys data.

SELECT
  assignment_id,
  COUNT(*) AS non_deleted_attendance_rows,
  MIN(created_at) AS first_attendance_created_at,
  MAX(created_at) AS last_attendance_created_at
FROM attendance_logs
WHERE deleted_at IS NULL
GROUP BY assignment_id
HAVING COUNT(*) > 1
ORDER BY non_deleted_attendance_rows DESC, last_attendance_created_at DESC;
