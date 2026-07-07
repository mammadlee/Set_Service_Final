ALTER TABLE "users"
ADD COLUMN "email_verified_at" TIMESTAMP(3),
ADD COLUMN "pending_email" TEXT,
ADD COLUMN "email_verification_code_hash" TEXT,
ADD COLUMN "email_verification_expires_at" TIMESTAMP(3),
ADD COLUMN "email_verification_sent_at" TIMESTAMP(3);

UPDATE "users"
SET "email_verified_at" = COALESCE("email_verified_at", NOW())
WHERE "email" IS NOT NULL;

CREATE UNIQUE INDEX "users_pending_email_key" ON "users"("pending_email");
CREATE INDEX "users_email_verified_at_idx" ON "users"("email_verified_at");
