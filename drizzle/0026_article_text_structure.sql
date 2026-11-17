-- How a base article is organized (sequence, cause_effect, problem_solution, compare_contrast, description); the morning batch rotates through them
ALTER TABLE "article_cache" ADD COLUMN IF NOT EXISTS "text_structure" text;
