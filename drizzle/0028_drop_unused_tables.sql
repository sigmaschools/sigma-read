-- Issue 164: Compass owns the people and the interest graph, and the read API is gone.
-- No code reads or writes these tables. Dropped on the owner's typed go-ahead of 20 Nov 2026.
-- Children first. CASCADE on guides only removes the students.guide_id constraint; the column stays.
DROP TABLE IF EXISTS "parent_feedback";
DROP TABLE IF EXISTS "parent_conversations";
DROP TABLE IF EXISTS "student_parents";
DROP TABLE IF EXISTS "parents";
DROP TABLE IF EXISTS "guides" CASCADE;
DROP TABLE IF EXISTS "admins";
DROP TABLE IF EXISTS "api_request_log";
DROP TABLE IF EXISTS "api_clients";
DROP TABLE IF EXISTS "interest_signals";
DROP TABLE IF EXISTS "topic_relations";
DROP TABLE IF EXISTS "topic_aliases";
DROP TABLE IF EXISTS "topics";
