-- Link the demo student zack to his Compass learner (Staging test family), so Compass opens Sigma Read signed in as him
UPDATE "students" SET "external_id" = '687e4e95-f52c-44c8-a987-4e06ac5adfa1' WHERE lower("username") = 'zack' AND "external_id" IS NULL;
