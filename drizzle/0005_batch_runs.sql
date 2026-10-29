CREATE TABLE IF NOT EXISTS "batch_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" date NOT NULL UNIQUE,
  "status" varchar(20) DEFAULT 'running' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_until" timestamp,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "counts" jsonb DEFAULT '{}'::jsonb,
  "last_error" text,
  "alert_sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
