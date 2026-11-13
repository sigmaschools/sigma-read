-- Sign-in is from Compass only: new accounts are made without a password, so the column no longer has to be filled
ALTER TABLE "students" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "guides" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "admins" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "parents" ALTER COLUMN "password_hash" DROP NOT NULL;
