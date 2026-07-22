ALTER TABLE "otp_codes"
ADD COLUMN "consumed_at" TIMESTAMP(3);

-- Existing completed registrations pre-date the explicit consumption marker.
-- Backfill only registration OTPs attached to accounts whose password setup
-- proves that the completion transaction succeeded.
UPDATE "otp_codes" AS otp
SET "consumed_at" = COALESCE(otp."verified_at", otp."expires_at")
FROM "users" AS usr
WHERE otp."user_id" = usr."id"
  AND otp."purpose" IN ('worker_registration', 'company_registration')
  AND otp."verified_at" IS NOT NULL
  AND usr."password_set_at" IS NOT NULL
  AND otp."consumed_at" IS NULL;

CREATE INDEX "otp_codes_user_id_purpose_consumed_at_idx"
ON "otp_codes"("user_id", "purpose", "consumed_at");
