CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" serial PRIMARY KEY NOT NULL,
  "feature" varchar(40) NOT NULL,
  "model" varchar(80) NOT NULL,
  "student_id" integer,
  "input_tokens" integer NOT NULL,
  "output_tokens" integer NOT NULL,
  "cache_read_tokens" integer DEFAULT 0 NOT NULL,
  "cache_write_tokens" integer DEFAULT 0 NOT NULL,
  "cost_usd" numeric(12, 6),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ai_usage_created_at_idx" ON "ai_usage" ("created_at");
