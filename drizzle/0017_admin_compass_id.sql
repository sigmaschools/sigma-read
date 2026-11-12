-- Admins open the admin pages from Compass Admin (Compass app contract 1.2): their Compass person id, matched once by email and kept
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "external_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "admins_external_id_unique" ON "admins" ("external_id");
