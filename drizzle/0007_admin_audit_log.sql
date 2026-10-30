CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_id" integer NOT NULL,
  "action" varchar(40) NOT NULL,
  "target_type" varchar(20),
  "target_id" integer,
  "details" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
