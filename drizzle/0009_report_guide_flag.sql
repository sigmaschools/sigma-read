ALTER TABLE "comprehension_reports" ADD COLUMN IF NOT EXISTS "guide_flag" varchar(20);
ALTER TABLE "comprehension_reports" ADD COLUMN IF NOT EXISTS "guide_note" text;
ALTER TABLE "comprehension_reports" ADD COLUMN IF NOT EXISTS "guide_flagged_by" integer;
ALTER TABLE "comprehension_reports" ADD COLUMN IF NOT EXISTS "guide_flagged_role" varchar(10);
ALTER TABLE "comprehension_reports" ADD COLUMN IF NOT EXISTS "guide_flagged_at" timestamp;
