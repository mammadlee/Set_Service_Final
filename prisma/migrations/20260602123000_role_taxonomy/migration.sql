-- CreateEnum
CREATE TYPE "TaxonomyStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_az" TEXT NOT NULL,
    "name_en" TEXT,
    "status" "TaxonomyStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subdepartments" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_az" TEXT NOT NULL,
    "name_en" TEXT,
    "status" "TaxonomyStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subdepartments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "subdepartment_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_az" TEXT NOT NULL,
    "name_en" TEXT,
    "status" "TaxonomyStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_positions" (
    "worker_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_positions_pkey" PRIMARY KEY ("worker_id","position_id")
);

-- AlterTable
ALTER TABLE "order_category_items"
ADD COLUMN "department_id" TEXT,
ADD COLUMN "subdepartment_id" TEXT,
ADD COLUMN "position_id" TEXT;

-- AlterTable
ALTER TABLE "assignments"
ADD COLUMN "position_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "departments_slug_key" ON "departments"("slug");
CREATE INDEX "departments_status_idx" ON "departments"("status");
CREATE UNIQUE INDEX "subdepartments_slug_key" ON "subdepartments"("slug");
CREATE INDEX "subdepartments_department_id_status_idx" ON "subdepartments"("department_id", "status");
CREATE UNIQUE INDEX "positions_slug_key" ON "positions"("slug");
CREATE INDEX "positions_subdepartment_id_status_idx" ON "positions"("subdepartment_id", "status");
CREATE INDEX "worker_positions_position_id_idx" ON "worker_positions"("position_id");
CREATE INDEX "order_category_items_department_id_idx" ON "order_category_items"("department_id");
CREATE INDEX "order_category_items_subdepartment_id_idx" ON "order_category_items"("subdepartment_id");
CREATE INDEX "order_category_items_position_id_idx" ON "order_category_items"("position_id");
CREATE INDEX "assignments_position_id_status_idx" ON "assignments"("position_id", "status");

-- AddForeignKey
ALTER TABLE "subdepartments" ADD CONSTRAINT "subdepartments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_subdepartment_id_fkey" FOREIGN KEY ("subdepartment_id") REFERENCES "subdepartments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_positions" ADD CONSTRAINT "worker_positions_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_positions" ADD CONSTRAINT "worker_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_category_items" ADD CONSTRAINT "order_category_items_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_category_items" ADD CONSTRAINT "order_category_items_subdepartment_id_fkey" FOREIGN KEY ("subdepartment_id") REFERENCES "subdepartments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_category_items" ADD CONSTRAINT "order_category_items_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
