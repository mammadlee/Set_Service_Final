ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'worker_password_reset';
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'company_password_reset';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "password_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "password_set_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");
