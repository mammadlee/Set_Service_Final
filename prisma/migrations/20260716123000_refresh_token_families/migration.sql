-- Refresh-token family metadata enables rotation reuse detection. Existing
-- refresh JWTs intentionally become invalid because they do not carry the new
-- jti/family/session-version claims.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "jti" TEXT,
  ADD COLUMN IF NOT EXISTS "family_id" TEXT,
  ADD COLUMN IF NOT EXISTS "replaced_by_jti" TEXT,
  ADD COLUMN IF NOT EXISTS "revoked_reason" TEXT;

UPDATE "refresh_tokens"
SET
  "jti" = COALESCE("jti", "id"),
  "family_id" = COALESCE("family_id", "id")
WHERE "jti" IS NULL OR "family_id" IS NULL;

ALTER TABLE "refresh_tokens"
  ALTER COLUMN "jti" SET NOT NULL,
  ALTER COLUMN "family_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_jti_key"
  ON "refresh_tokens"("jti");
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_family_id_idx"
  ON "refresh_tokens"("user_id", "family_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_id_revoked_at_idx"
  ON "refresh_tokens"("family_id", "revoked_at");
