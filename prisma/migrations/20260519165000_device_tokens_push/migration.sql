CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "platform" TEXT,
    "device_id" TEXT,
    "app_role" "Role",
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_tokens_token_hash_key" ON "device_tokens"("token_hash");
CREATE INDEX "device_tokens_user_id_revoked_at_idx" ON "device_tokens"("user_id", "revoked_at");
CREATE INDEX "device_tokens_user_id_deleted_at_idx" ON "device_tokens"("user_id", "deleted_at");
CREATE INDEX "device_tokens_app_role_revoked_at_idx" ON "device_tokens"("app_role", "revoked_at");

ALTER TABLE "device_tokens"
ADD CONSTRAINT "device_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
