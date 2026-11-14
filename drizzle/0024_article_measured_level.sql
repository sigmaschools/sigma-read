-- Compass's reading-level measure of each article (app contract section 17): the estimated level, the model version that made it, and whether the result was reliable
ALTER TABLE "article_cache" ADD COLUMN IF NOT EXISTS "measured_level" integer;
ALTER TABLE "article_cache" ADD COLUMN IF NOT EXISTS "level_model_version" varchar(20);
ALTER TABLE "article_cache" ADD COLUMN IF NOT EXISTS "level_reliable" boolean;
