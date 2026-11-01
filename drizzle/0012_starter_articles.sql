ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "starter_articles_status" varchar(20);
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "starter_articles_started_at" timestamp;
