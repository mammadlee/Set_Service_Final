CREATE TYPE "public"."VenueKioskStatus" AS ENUM ('active', 'disabled');

CREATE TYPE "public"."KioskActiveSessionStatus" AS ENUM ('active', 'inactive', 'revoked');

CREATE TABLE "public"."venue_kiosks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_label" TEXT,
    "token_hash" TEXT NOT NULL,
    "token_ciphertext" TEXT,
    "status" "public"."VenueKioskStatus" NOT NULL DEFAULT 'active',
    "created_by_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "venue_kiosks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."kiosk_active_sessions" (
    "id" TEXT NOT NULL,
    "kiosk_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "public"."KioskActiveSessionStatus" NOT NULL DEFAULT 'active',
    "activated_by_id" TEXT,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "kiosk_active_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_kiosks_token_hash_key" ON "public"."venue_kiosks"("token_hash");
CREATE INDEX "venue_kiosks_company_id_status_idx" ON "public"."venue_kiosks"("company_id", "status");
CREATE INDEX "venue_kiosks_revoked_at_idx" ON "public"."venue_kiosks"("revoked_at");
CREATE INDEX "venue_kiosks_deleted_at_idx" ON "public"."venue_kiosks"("deleted_at");
CREATE INDEX "kiosk_active_sessions_kiosk_id_status_revoked_at_idx" ON "public"."kiosk_active_sessions"("kiosk_id", "status", "revoked_at");
CREATE INDEX "kiosk_active_sessions_company_id_status_idx" ON "public"."kiosk_active_sessions"("company_id", "status");
CREATE INDEX "kiosk_active_sessions_order_id_idx" ON "public"."kiosk_active_sessions"("order_id");
CREATE INDEX "kiosk_active_sessions_expires_at_idx" ON "public"."kiosk_active_sessions"("expires_at");
CREATE INDEX "kiosk_active_sessions_deleted_at_idx" ON "public"."kiosk_active_sessions"("deleted_at");

ALTER TABLE "public"."venue_kiosks" ADD CONSTRAINT "venue_kiosks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."venue_kiosks" ADD CONSTRAINT "venue_kiosks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."kiosk_active_sessions" ADD CONSTRAINT "kiosk_active_sessions_kiosk_id_fkey" FOREIGN KEY ("kiosk_id") REFERENCES "public"."venue_kiosks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."kiosk_active_sessions" ADD CONSTRAINT "kiosk_active_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."kiosk_active_sessions" ADD CONSTRAINT "kiosk_active_sessions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."kiosk_active_sessions" ADD CONSTRAINT "kiosk_active_sessions_activated_by_id_fkey" FOREIGN KEY ("activated_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
