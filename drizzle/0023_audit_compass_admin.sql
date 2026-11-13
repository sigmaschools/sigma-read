ALTER TABLE "admin_audit_log" ALTER COLUMN "admin_id" DROP NOT NULL;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "admin_compass_id" text;
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "admin_name" text;
