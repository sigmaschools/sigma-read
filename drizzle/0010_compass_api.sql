ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "guides" ADD COLUMN IF NOT EXISTS "external_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "students_external_id_unique" ON "students" ("external_id");
CREATE UNIQUE INDEX IF NOT EXISTS "guides_external_id_unique" ON "guides" ("external_id");
CREATE TABLE IF NOT EXISTS "api_clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "key_prefix" varchar(16) NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "guide_id" integer,
  "created_by" integer,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "api_request_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "method" varchar(8) NOT NULL,
  "path" text NOT NULL,
  "status" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "api_request_log_client_time_idx" ON "api_request_log" ("client_id", "created_at");
