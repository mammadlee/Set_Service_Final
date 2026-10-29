-- Review accounts live in the production database but must remain logically
-- isolated from customer data. Existing users are production users by default.
ALTER TABLE "users"
ADD COLUMN "is_review_account" BOOLEAN NOT NULL DEFAULT false;

-- Successful reviewer logins are auditable without weakening the normal
-- authentication flow or recording account identifiers in application logs.
ALTER TYPE "AuditAction" ADD VALUE 'login_succeeded';
