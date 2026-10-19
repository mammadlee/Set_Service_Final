-- Keep this migration to exactly one statement. PostgreSQL forbids concurrent
-- index creation inside a transaction, while a multi-statement migration is
-- submitted as one implicit transaction by the PostgreSQL protocol.
CREATE INDEX CONCURRENTLY "users_is_review_account_role_idx"
ON "users"("is_review_account", "role");
