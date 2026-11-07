-- The redesigned tutor (src/lib/tutor): prep notes per base article, and the observer's notes per conversation
ALTER TABLE "article_cache" ADD COLUMN IF NOT EXISTS "guide_notes" jsonb;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "tutor_design" varchar(10);
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "observer_notes" jsonb;
