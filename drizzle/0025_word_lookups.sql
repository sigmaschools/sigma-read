-- Every tap-to-define lookup: who, which word, in which article and sentence, and when
CREATE TABLE IF NOT EXISTS "word_lookups" ("id" serial PRIMARY KEY NOT NULL, "student_id" integer NOT NULL REFERENCES "students"("id"), "article_id" integer REFERENCES "articles"("id"), "word" text NOT NULL, "sentence" text, "created_at" timestamp DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS "word_lookups_student_time_idx" ON "word_lookups" ("student_id", "created_at");
