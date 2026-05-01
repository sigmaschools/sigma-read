ALTER TABLE "generated_topics" ADD COLUMN IF NOT EXISTS "query" text;

CREATE TABLE IF NOT EXISTS "interest_rotation" (
  "id" serial PRIMARY KEY NOT NULL,
  "interest" text NOT NULL UNIQUE,
  "last_featured_at" date,
  "student_ids" integer[],
  "updated_at" timestamp DEFAULT now() NOT NULL
);
