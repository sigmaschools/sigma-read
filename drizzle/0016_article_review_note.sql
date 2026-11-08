-- Articles written from the model's own knowledge (no source page fit the story) are marked for an admin to check
ALTER TABLE "article_cache" ADD COLUMN IF NOT EXISTS "review_note" text;
