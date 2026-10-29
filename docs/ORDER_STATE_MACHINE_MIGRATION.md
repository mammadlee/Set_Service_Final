# Order state-machine migration

Migration `20260716100000_order_state_machine_phase7` is an expand-only release:

- it adds order statuses without removing the legacy `active` value;
- it adds `orders.version` with a non-null default of `1`;
- it adds explicit idempotency processing state and completion time;
- it creates append-only order status history;
- it adds cleanup and outbox retry indexes.

The application must be deployed after the migration. Existing `active` orders
remain readable and cancellable during the compatibility window. A later,
separately reviewed contract migration may map legacy `active` orders to the
more specific states and only then remove the legacy value.

## Rollback strategy

Do not attempt to remove PostgreSQL enum values in place. If application
rollback is required, roll back the application binary while leaving the added
columns, table, indexes, and enum values in place; older code ignores them.
After the rollback window closes, unused indexes/table/columns may be removed
only in a separate contract migration after confirming that no deployed
application version reads or writes them.

## Local verification

Apply this migration only to a local or isolated test database, then run:

```bash
npx prisma migrate deploy
npx prisma migrate status
npx prisma validate
npm run test:orders-hardening
```

No production database is modified by repository tests.
