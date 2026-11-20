-- Sign-in has been from Compass only since 13 Nov 2026; the owner chose to clear the stored passwords after a week (#163)
UPDATE "students" SET "password_hash" = NULL WHERE "password_hash" IS NOT NULL;
UPDATE "guides" SET "password_hash" = NULL WHERE "password_hash" IS NOT NULL;
UPDATE "admins" SET "password_hash" = NULL WHERE "password_hash" IS NOT NULL;
UPDATE "parents" SET "password_hash" = NULL WHERE "password_hash" IS NOT NULL;
