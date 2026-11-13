-- Compass owns the people (issue 164): a student's row is made from Compass's note at their first launch, with no username and no guide
ALTER TABLE "students" ALTER COLUMN "username" DROP NOT NULL;
ALTER TABLE "students" ALTER COLUMN "guide_id" DROP NOT NULL;
