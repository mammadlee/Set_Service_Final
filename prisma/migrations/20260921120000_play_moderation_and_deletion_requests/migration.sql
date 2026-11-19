CREATE TYPE "ModerationTargetType" AS ENUM (
  'order', 'company_profile', 'worker_profile', 'rating'
);

CREATE TYPE "ModerationReason" AS ENUM (
  'inappropriate_content', 'harassment', 'false_information', 'spam', 'privacy', 'other'
);

CREATE TYPE "ModerationReportStatus" AS ENUM (
  'open', 'reviewing', 'resolved', 'dismissed'
);

CREATE TYPE "ExternalDeletionRequestStatus" AS ENUM (
  'open', 'reviewing', 'resolved', 'dismissed'
);

CREATE TABLE "moderation_reports" (
  "id" TEXT NOT NULL,
  "reporter_user_id" TEXT,
  "reporter_role" "Role" NOT NULL,
  "target_type" "ModerationTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "reason" "ModerationReason" NOT NULL,
  "details" TEXT,
  "status" "ModerationReportStatus" NOT NULL DEFAULT 'open',
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "moderation_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_account_deletion_requests" (
  "id" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "identifier_kind" TEXT NOT NULL,
  "identifier_hmac" TEXT NOT NULL,
  "account_user_id" TEXT,
  "note" TEXT,
  "status" "ExternalDeletionRequestStatus" NOT NULL DEFAULT 'open',
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_account_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "moderation_reports_status_created_at_idx"
  ON "moderation_reports"("status", "created_at");
CREATE INDEX "moderation_reports_reporter_user_id_created_at_idx"
  ON "moderation_reports"("reporter_user_id", "created_at");
CREATE INDEX "moderation_reports_target_type_target_id_idx"
  ON "moderation_reports"("target_type", "target_id");

CREATE INDEX "external_account_deletion_requests_status_created_at_idx"
  ON "external_account_deletion_requests"("status", "created_at");
CREATE INDEX "external_account_deletion_requests_account_user_id_created_at_idx"
  ON "external_account_deletion_requests"("account_user_id", "created_at");
CREATE INDEX "external_account_deletion_requests_identifier_hmac_created_at_idx"
  ON "external_account_deletion_requests"("identifier_hmac", "created_at");

ALTER TABLE "moderation_reports"
  ADD CONSTRAINT "moderation_reports_reporter_user_id_fkey"
  FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "moderation_reports"
  ADD CONSTRAINT "moderation_reports_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "external_account_deletion_requests"
  ADD CONSTRAINT "external_account_deletion_requests_account_user_id_fkey"
  FOREIGN KEY ("account_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "external_account_deletion_requests"
  ADD CONSTRAINT "external_account_deletion_requests_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
