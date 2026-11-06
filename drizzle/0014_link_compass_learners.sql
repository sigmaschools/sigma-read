-- Link the two students who are Compass learners (sigma-read#126); ids from Compass, issue comment of 6 Nov 2026
UPDATE "students" SET "external_id" = 'ee90182d-f088-44c8-bda9-92ab3f90bd4d' WHERE lower("username") = 'max' AND "external_id" IS NULL;
UPDATE "students" SET "external_id" = 'bb41aac7-6d24-4dcf-aae0-30203739a8fe' WHERE lower("username") = 'lily' AND "external_id" IS NULL;
