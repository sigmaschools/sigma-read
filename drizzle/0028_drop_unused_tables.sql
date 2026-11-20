-- Issue 164: Compass owns the people and the interest graph, and the read API is gone.
-- No code reads or writes these tables. Dropped on the owner's typed go-ahead of 20 Nov 2026.
-- Children first, no CASCADE: anything unexpected that still depends on a table makes the whole file fail and drops nothing.
-- students.guide_id keeps its column and loses only its link to guides.
DROP TABLE IF EXISTS "parent_feedback";
DROP TABLE IF EXISTS "parent_conversations";
DROP TABLE IF EXISTS "student_parents";
DROP TABLE IF EXISTS "parents";
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_guide_id_guides_id_fk";
DROP TABLE IF EXISTS "guides";
DROP TABLE IF EXISTS "admins";
DROP TABLE IF EXISTS "api_request_log";
DROP TABLE IF EXISTS "api_clients";
DROP TABLE IF EXISTS "interest_signals";
DROP TABLE IF EXISTS "topic_relations";
DROP TABLE IF EXISTS "topic_aliases";
DROP TABLE IF EXISTS "topics";
