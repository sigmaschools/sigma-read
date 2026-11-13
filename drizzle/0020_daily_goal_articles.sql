-- The day's reading goal in articles, as Compass gives it in the profile note at sign-in (Compass app contract 1.11); null means three
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "daily_goal_articles" integer;
