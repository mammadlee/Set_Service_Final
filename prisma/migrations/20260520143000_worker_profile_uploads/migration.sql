ALTER TABLE "workers"
  ADD COLUMN IF NOT EXISTS "profile_photo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "work_history_summary" TEXT;
