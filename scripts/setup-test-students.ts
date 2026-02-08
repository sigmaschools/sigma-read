/**
 * Setup Test Students
 * 
 * Removes old test accounts (teststudent, newstudent) and ensures
 * all test students have proper names and personas. Leaves a few
 * un-onboarded for testing. Never touches Max Vaughan.
 */

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);

// Students to DELETE (generic test names)
const DELETE_USERNAMES = ["teststudent", "newstudent"];

// Students to ADD (replacing deleted ones + filling gaps)
// Leave 2 un-onboarded for testing
const NEW_STUDENTS = [
  { name: "Noah Carter", username: "noah", guideId: 1, gradeLevel: 3, age: 8, readingLevel: 1, onboard: false },
  { name: "Lily Thompson", username: "lily", guideId: 1, gradeLevel: 4, age: 9, readingLevel: 2, onboard: false },
];

async function main() {
  console.log("\n🧹 Test Student Setup\n");

  // Delete generic test students
  for (const username of DELETE_USERNAMES) {
    const [student] = await sql`SELECT id, name FROM students WHERE username = ${username}`;
    if (student) {
      // Clean up all associated data
      await sql`DELETE FROM comprehension_reports WHERE conversation_id IN (
        SELECT c.id FROM conversations c 
        JOIN reading_sessions rs ON c.reading_session_id = rs.id 
        WHERE rs.student_id = ${student.id}
      )`;
      await sql`DELETE FROM conversations WHERE reading_session_id IN (
        SELECT id FROM reading_sessions WHERE student_id = ${student.id}
      )`;
      await sql`DELETE FROM reading_sessions WHERE student_id = ${student.id}`;
      await sql`DELETE FROM articles WHERE student_id = ${student.id}`;
      await sql`DELETE FROM article_favorites WHERE student_id = ${student.id}`;
      await sql`DELETE FROM article_ratings WHERE student_id = ${student.id}`;
      await sql`DELETE FROM article_feed_events WHERE student_id = ${student.id}`;
      await sql`DELETE FROM student_article_history WHERE student_id = ${student.id}`;
      await sql`DELETE FROM level_history WHERE student_id = ${student.id}`;
      await sql`DELETE FROM students WHERE id = ${student.id}`;
      console.log(`  ❌ Deleted: ${student.name} (${username})`);
    }
  }

  // Add new students
  const hash = await bcrypt.hash("sigma2026", 10);
  for (const s of NEW_STUDENTS) {
    const existing = await sql`SELECT id FROM students WHERE username = ${s.username}`;
    if (existing.length > 0) {
      console.log(`  ⏭️ Skipped: ${s.name} (${s.username}) — already exists`);
      continue;
    }
    await sql`INSERT INTO students (name, username, password_hash, guide_id, grade_level, age, reading_level, onboarding_complete)
      VALUES (${s.name}, ${s.username}, ${hash}, ${s.guideId}, ${s.gradeLevel}, ${s.age}, ${s.onboard ? s.readingLevel : null}, ${s.onboard})`;
    console.log(`  ✅ Created: ${s.name} (${s.username}) ${s.onboard ? "" : "— NOT onboarded (for testing)"}`);
  }

  // List final state
  const students = await sql`SELECT id, name, username, reading_level, onboarding_complete, grade_level, age 
    FROM students ORDER BY id`;
  console.log(`\n📋 All students (${students.length}):\n`);
  for (const s of students) {
    const status = s.onboarding_complete ? `L${s.reading_level || "?"}` : "⏳ Not onboarded";
    console.log(`  ${s.id.toString().padStart(2)}. ${s.name.padEnd(20)} (${s.username.padEnd(12)}) Gr ${s.grade_level || "?"} Age ${s.age || "?"} ${status}`);
  }

  console.log("\n✅ Done\n");
}

main().catch(console.error);
