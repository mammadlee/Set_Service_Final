-- Read-only deployment guard run before `prisma migrate deploy`.
-- A fresh database does not have attendance_logs yet and is safe to continue.
-- An existing database must not contain more than one non-deleted attendance
-- row per assignment before the unique attendance migration is applied.

DO $$
DECLARE
  duplicate_group_count BIGINT;
BEGIN
  IF to_regclass('public.attendance_logs') IS NULL THEN
    RAISE NOTICE 'attendance_logs is not present; treating this as a fresh database';
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO duplicate_group_count
  FROM (
    SELECT assignment_id
    FROM attendance_logs
    WHERE deleted_at IS NULL
    GROUP BY assignment_id
    HAVING COUNT(*) > 1
  ) AS duplicate_assignments;

  IF duplicate_group_count > 0 THEN
    RAISE EXCEPTION
      'attendance preflight failed: % assignment(s) have duplicate non-deleted attendance rows; run scripts/preflight-attendance-one-session.sql and resolve them manually',
      duplicate_group_count;
  END IF;

  RAISE NOTICE 'attendance preflight passed';
END
$$;
