ALTER TABLE "comprehension_reports" ADD COLUMN IF NOT EXISTS "level_before" integer;
ALTER TABLE "comprehension_reports" ADD COLUMN IF NOT EXISTS "level_after" integer;
