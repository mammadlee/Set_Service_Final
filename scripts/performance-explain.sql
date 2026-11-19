-- MANUAL, STAGING-ONLY PLAN REVIEW.
-- This file was not executed by the repository audit.
-- Supply representative identifiers in psql before running, for example:
-- \set company_id '00000000-0000-4000-8000-000000000000'
-- \set worker_id  '00000000-0000-4000-8000-000000000000'
-- \set order_id   '00000000-0000-4000-8000-000000000000'

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, status, created_at
FROM orders
WHERE company_id = :'company_id'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, order_id, status, assigned_at
FROM assignments
WHERE worker_id = :'worker_id'
  AND status IN ('assigned', 'accepted', 'completed')
  AND deleted_at IS NULL
ORDER BY assigned_at DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, type, read_at, created_at
FROM notifications
WHERE recipient_id = :'worker_id'
  AND read_at IS NULL
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, event_type, attempts, available_at, created_at
FROM outbox_events
WHERE status = 'pending'
  AND available_at <= CURRENT_TIMESTAMP
ORDER BY available_at ASC, created_at ASC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, from_status, to_status, version, created_at
FROM order_status_history
WHERE order_id = :'order_id'
ORDER BY created_at DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, revoked_at, expires_at
FROM refresh_tokens
WHERE family_id = (
  SELECT family_id
  FROM refresh_tokens
  WHERE user_id = :'worker_id'
  ORDER BY created_at DESC
  LIMIT 1
)
ORDER BY created_at DESC
LIMIT 50;

ROLLBACK;

