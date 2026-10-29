ALTER TABLE "users"
ADD COLUMN "email_verification_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "email_verification_blocked_until" TIMESTAMP(3);

CREATE INDEX "users_email_verification_blocked_until_idx"
ON "users"("email_verification_blocked_until");
