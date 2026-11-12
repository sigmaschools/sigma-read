-- Admins open the admin pages from Compass Admin (Compass app contract 1.2): their Compass person id, matched once by email and kept
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "external_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "admins_external_id_unique" ON "admins" ("external_id");
-- The one admin today is the founder: linked to their Compass person id, as 0014 linked the students
UPDATE "admins" SET "external_id" = 'b34efc98-c7bc-46a8-bfaa-22c9609f9005' WHERE "external_id" IS NULL AND (SELECT count(*) FROM "admins") = 1;
