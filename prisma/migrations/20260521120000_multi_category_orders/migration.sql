-- Multi-category orders with backward compatibility for existing single-category orders.

CREATE TABLE IF NOT EXISTS "order_category_items" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "required_count" INTEGER NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "order_category_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "order_category_items"
  ADD CONSTRAINT "order_category_items_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "order_category_items_order_id_idx" ON "order_category_items"("order_id");
CREATE INDEX IF NOT EXISTS "order_category_items_order_id_category_idx" ON "order_category_items"("order_id", "category");
CREATE INDEX IF NOT EXISTS "order_category_items_category_idx" ON "order_category_items"("category");
CREATE INDEX IF NOT EXISTS "order_category_items_deleted_at_idx" ON "order_category_items"("deleted_at");

ALTER TABLE "assignments"
  ADD COLUMN IF NOT EXISTS "order_category_item_id" TEXT,
  ADD COLUMN IF NOT EXISTS "assigned_category" TEXT;

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_order_category_item_id_fkey"
  FOREIGN KEY ("order_category_item_id") REFERENCES "order_category_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "assignments_order_id_order_category_item_id_idx" ON "assignments"("order_id", "order_category_item_id");
CREATE INDEX IF NOT EXISTS "assignments_assigned_category_status_idx" ON "assignments"("assigned_category", "status");
CREATE INDEX IF NOT EXISTS "assignments_assigned_at_idx" ON "assignments"("assigned_at");
CREATE INDEX IF NOT EXISTS "ratings_created_at_idx" ON "ratings"("created_at");

INSERT INTO "order_category_items" ("id", "order_id", "category", "required_count", "notes", "created_at", "updated_at")
SELECT CONCAT('order-category-', "id"), "id", "category", "required_count", NULL, "created_at", "updated_at"
FROM "orders"
WHERE "deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "order_category_items"
    WHERE "order_category_items"."order_id" = "orders"."id"
      AND "order_category_items"."deleted_at" IS NULL
  );

UPDATE "assignments"
SET
  "order_category_item_id" = "order_category_items"."id",
  "assigned_category" = "order_category_items"."category"
FROM "order_category_items"
WHERE "assignments"."order_id" = "order_category_items"."order_id"
  AND "assignments"."order_category_item_id" IS NULL
  AND "order_category_items"."deleted_at" IS NULL;
