/**
 * Student Activity Simulator
 *
 * Writes simulated sessions to the database it's pointed at; never point it at production.
 * For testing prompt changes, use scripts/eval-conversations.ts (npm run eval), which runs
 * the same tutor-turn logic in memory. This script uses that logic too (runTutorTurn,
 * saveComprehensionReport), so stored transcripts, closings, reports, interest signals and
 * level changes match what real sessions produce.
 * 
 * Runs automated student sessions with persona-driven, organic conversations.
 * Each student has a unique personality that affects how they discuss articles.
 * 
 * Usage: 
 *   npx tsx --require ./scripts/md-require.cjs scripts/simulate-students.ts                     # All eligible students, 3 sessions each
 *   npx tsx --require ./scripts/md-require.cjs scripts/simulate-students.ts --students=emma,jayden --sessions=2
 *   npx tsx --require ./scripts/md-require.cjs scripts/simulate-students.ts --level=1           # Only L1 students
 *   npx tsx --require ./scripts/md-require.cjs scripts/simulate-students.ts --dry-run           # Show what would happen
 * 
 * NEVER simulates: Max Vaughan, un-onboarded students
 */

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { getPersona, EXCLUDED_USERNAMES, type StudentPersona } from "./test-personas";
import { buildStudentSystemPrompt } from "./eval/student-sim";
import { runTutorTurn, type ClosingKind } from "../src/lib/conversation-turn";
import { saveComprehensionReport } from "../src/lib/comprehension-report";
import { comprehensionConversationPrompt, pickConversationStyle, maxWordsForLevel } from "../src/lib/prompts";
import { MODELS } from "../src/lib/models";
import { tracked } from "../src/lib/ai-usage";
import { assertNotProduction } from "./sim-guard";

const DATABASE_URL = process.env.DATABASE_URL!;
const sql = neon(DATABASE_URL);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Parse args
const args = process.argv.slice(2);
const getArg = (name: string) => {
  const a = args.find(a => a.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};
const targetStudents = getArg("students")?.split(",") || null;
const sessionsPerStudent = parseInt(getArg("sessions") || "3");
const targetLevel = getArg("level") ? parseInt(getArg("level")!) : null;
const dryRun = args.includes("--dry-run");

function pickSelfAssessment(persona: StudentPersona, actualScore: number): string {
  const options = ["really_well", "pretty_well", "not_sure", "lost"];
  
  if (persona.selfAssessmentBias === "overconfident") {
    if (actualScore >= 70) return "really_well";
    if (actualScore >= 50) return "really_well"; // overestimates
    return "pretty_well"; // still overestimates
  } else if (persona.selfAssessmentBias === "underconfident") {
    if (actualScore >= 80) return "pretty_well"; // underestimates
    if (actualScore >= 60) return "not_sure";
    return "lost";
  } else {
    // accurate
    if (actualScore >= 80) return "really_well";
    if (actualScore >= 60) return "pretty_well";
    if (actualScore >= 40) return "not_sure";
    return "lost";
  }
}

async function simulateStudentResponse(
  articleText: string,
  level: number,
  conversationSoFar: { role: string; content: string }[],
  persona: StudentPersona,
): Promise<string> {
  const aiMessage = conversationSoFar[conversationSoFar.length - 1].content;
  const response = await anthropic.messages.create({
    model: MODELS.standard,
    max_tokens: 200,
    system: buildStudentSystemPrompt(persona, level),
    messages: [
      {
        role: "user",
        content: `Article you just read:\n---\n${articleText.slice(0, 2000)}\n---\n\nConversation so far:\n${conversationSoFar.map(m => `${m.role === "user" ? "You" : "Teacher"}: ${m.content}`).join("\n")}\n\nThe teacher just said: "${aiMessage}"\n\nRespond as this student would. Just the student's response, nothing else.`
      },
    ],
  });

  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  return text || "I'm not sure";
}

/** Safety net on top of the tutor's own 6-message backstop */
const MAX_TUTOR_TURNS = 10;

async function runSession(
  studentId: number,
  studentName: string,
  articleId: number,
  articleTitle: string,
  articleBody: string,
  persona: StudentPersona,
) {
  // Re-read the level each session: progression from the previous session may have changed it
  const [student] = await sql`SELECT reading_level, interest_profile FROM students WHERE id = ${studentId}`;
  const level: number = student.reading_level || 2;
  console.log(`    📖 "${articleTitle}" (student at L${level})`);

  const [session] = await sql`
    INSERT INTO reading_sessions (student_id, article_id, reading_completed_at)
    VALUES (${studentId}, ${articleId}, NOW())
    RETURNING id, started_at
  `;
  const [conv] = await sql`
    INSERT INTO conversations (reading_session_id, messages, complete)
    VALUES (${session.id}, '[]'::jsonb, false)
    RETURNING id
  `;

  // Same prompt, turn logic, closing and report the chat route uses
  const style = pickConversationStyle();
  const systemPrompt = comprehensionConversationPrompt(
    articleBody, level, JSON.stringify(student.interest_profile || {}), undefined, null, style,
  );

  const messages: { role: string; content: string; timestamp: string }[] = [];
  let progress = 0;
  let closing: ClosingKind | null = null;
  for (let turn = 0; turn < MAX_TUTOR_TURNS; turn++) {
    const result = await runTutorTurn({
      client: tracked(anthropic, "tutor_turn", studentId),
      model: MODELS.heavy,
      systemPrompt,
      messages,
      priorProgress: progress,
      maxWords: maxWordsForLevel(level),
    });
    progress = result.progressScore;
    messages.push({ role: "assistant", content: result.message, timestamp: new Date().toISOString() });
    if (result.complete) { closing = result.closing; break; }
    const reply = await simulateStudentResponse(articleBody, level, messages, persona);
    messages.push({ role: "user", content: reply, timestamp: new Date().toISOString() });
  }

  await sql`UPDATE conversations SET messages = ${JSON.stringify(messages)}::jsonb, complete = true,
    conversation_style = ${style}, progress_score = ${progress} WHERE id = ${conv.id}`;
  await sql`UPDATE articles SET read = true WHERE id = ${articleId}`;
  await sql`UPDATE reading_sessions SET completed_at = NOW() WHERE id = ${session.id}`;

  const transcript = messages.map(m => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`).join("\n\n");
  await saveComprehensionReport({
    anthropic,
    conversationId: conv.id,
    studentId,
    articleId,
    studentName,
    articleText: articleBody,
    level,
    messages,
    transcript,
    // Hitting MAX_TUTOR_TURNS without a closing counts as forced too
    forcedClose: closing !== "earned",
    inChatScore: progress,
  });

  const [report] = await sql`SELECT score FROM comprehension_reports WHERE conversation_id = ${conv.id}`;
  if (report) {
    const selfAssessment = pickSelfAssessment(persona, report.score);
    await sql`UPDATE comprehension_reports SET self_assessment = ${selfAssessment} WHERE conversation_id = ${conv.id}`;
    const [after] = await sql`SELECT reading_level FROM students WHERE id = ${studentId}`;
    const levelNote = after.reading_level !== level ? ` | Level: L${level} → L${after.reading_level}` : "";
    console.log(`    ✅ Score: ${report.score} | SA: ${selfAssessment} | ${messages.length} msgs | ${closing ?? "no"} close | Style: ${style}${levelNote}`);
  } else {
    console.log(`    ⚠️ No report saved`);
  }

  await sql`UPDATE students SET total_sessions_completed = total_sessions_completed + 1 WHERE id = ${studentId}`;
}

async function main() {
  console.log(`\n🤖 Student Activity Simulator\n`);
  console.log(`Sessions per student: ${sessionsPerStudent}`);
  if (targetStudents) console.log(`Target students: ${targetStudents.join(", ")}`);
  if (targetLevel) console.log(`Target level: ${targetLevel}`);
  if (dryRun) console.log(`Mode: DRY RUN`);
  console.log();

  await assertNotProduction(sql);

  // Get eligible students
  let students;
  if (targetStudents) {
    students = await sql`SELECT id, name, username, reading_level FROM students 
      WHERE onboarding_complete = true AND username = ANY(${targetStudents})
      AND username != ALL(${EXCLUDED_USERNAMES})`;
  } else if (targetLevel) {
    students = await sql`SELECT id, name, username, reading_level FROM students 
      WHERE onboarding_complete = true AND reading_level = ${targetLevel}
      AND username != ALL(${EXCLUDED_USERNAMES})`;
  } else {
    students = await sql`SELECT id, name, username, reading_level FROM students 
      WHERE onboarding_complete = true AND reading_level IS NOT NULL
      AND username != ALL(${EXCLUDED_USERNAMES})`;
  }

  console.log(`📚 ${students.length} students to simulate\n`);

  let totalSessions = 0;
  let totalErrors = 0;

  for (const student of students) {
    const persona = getPersona(student.username);
    if (!persona) {
      console.log(`  ⏭️ ${student.name} — no persona defined, skipping`);
      continue;
    }

    console.log(`\n👤 ${student.name} (${student.username}, L${student.reading_level})`);
    console.log(`   Personality: ${persona.personality.slice(0, 80)}...`);

    // Get unread articles
    const [{ n: unread }] = await sql`SELECT count(*)::int AS n FROM articles WHERE student_id = ${student.id} AND read = false`;
    if (!unread) {
      console.log(`    ⚠️ No unread articles — skipping`);
      continue;
    }

    if (dryRun) {
      console.log(`    Would run ${Math.min(unread, sessionsPerStudent)} sessions (${unread} unread)`);
      continue;
    }

    for (let i = 0; i < sessionsPerStudent; i++) {
      // Pick each article after the previous session, since progression may have moved the level;
      // closest to the student's current level first, as the real feed serves them
      const [article] = await sql`SELECT a.id, a.title, a.body_text FROM articles a, students s
        WHERE a.student_id = ${student.id} AND s.id = a.student_id AND a.read = false
        ORDER BY abs(a.reading_level - s.reading_level), RANDOM() LIMIT 1`;
      if (!article) break;
      try {
        await runSession(student.id, student.name, article.id, article.title, article.body_text, persona);
        totalSessions++;
      } catch (e: any) {
        console.log(`    ❌ Error: ${e.message}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ Simulation complete: ${totalSessions} sessions, ${totalErrors} errors\n`);
}

main().catch(console.error);
