/**
 * Student Activity Simulator
 * 
 * Runs automated student sessions with persona-driven, organic conversations.
 * Each student has a unique personality that affects how they discuss articles.
 * 
 * Usage: 
 *   npx tsx scripts/simulate-students.ts                     # All eligible students, 3 sessions each
 *   npx tsx scripts/simulate-students.ts --students=emma,jayden --sessions=2
 *   npx tsx scripts/simulate-students.ts --level=1           # Only L1 students
 *   npx tsx scripts/simulate-students.ts --dry-run           # Show what would happen
 * 
 * NEVER simulates: Max Vaughan, un-onboarded students
 */

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { getPersona, EXCLUDED_USERNAMES, type StudentPersona } from "./test-personas";

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

function levelGrade(level: number): string {
  const grades: Record<number, string> = {
    1: "grade 2-3 (age 7-8)", 2: "grade 3-4 (age 8-9)", 3: "grade 5-6 (age 10-11)",
    4: "grade 7 (age 12)", 5: "grade 8 (age 13)", 6: "grade 8+ (age 14+)",
  };
  return grades[level] || "grade 5";
}

function buildStudentSystemPrompt(persona: StudentPersona, level: number): string {
  const selfAssessMap = {
    accurate: "Rate your understanding honestly",
    overconfident: "Tend to think you understood more than you did",
    underconfident: "Tend to doubt yourself even when you got it right",
  };

  return `You are simulating a SPECIFIC student in a reading comprehension discussion.

STUDENT: ${persona.username}
GRADE LEVEL: ${levelGrade(level)}
PERSONALITY: ${persona.personality}
DISCUSSION STYLE: ${persona.discussionStyle}

QUIRKS (use these naturally, not every message):
${persona.quirks.map(q => `- ${q}`).join("\n")}

INTERESTS (reference when natural):
${persona.interests.join(", ")}

COMPREHENSION: ${persona.comprehensionTendency} — ${
  persona.comprehensionTendency === "strong" ? "Usually gets the main ideas and details right" :
  persona.comprehensionTendency === "average" ? "Gets some things right, misses others" :
  "Often misses key points or misunderstands"
}

ENGAGEMENT: ${persona.engagementLevel} — ${
  persona.engagementLevel === "high" ? "Writes more, shares thoughts freely" :
  persona.engagementLevel === "medium" ? "Adequate responses, engaged but not effusive" :
  "Brief, minimal responses unless something catches interest"
}

CRITICAL RULES:
- Be THIS specific student, not a generic student
- Vary message length naturally (sometimes 3 words, sometimes 2 sentences)
- Make mistakes appropriate to the comprehension level
- Use vocabulary appropriate to the grade level
- Don't be formulaic — real kids are messy, surprising, distracted
- About 15% of the time, go slightly off-topic based on interests/quirks
- Never mention being a simulation
- Write in plain text, no markdown, no emojis unless this student would use them
- ${persona.engagementLevel === "low" ? "Keep most responses under 10 words" : ""}
- ${persona.comprehensionTendency === "weak" ? "Get at least 1 in 3 responses noticeably wrong or confused" : ""}
- ${persona.comprehensionTendency === "strong" ? "Show real understanding but don't be perfect" : ""}`;
}

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
  aiMessage: string,
  conversationSoFar: { role: string; content: string }[],
  persona: StudentPersona,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 200,
    system: buildStudentSystemPrompt(persona, level),
    messages: [
      {
        role: "user",
        content: `Article you just read:\n---\n${articleText.slice(0, 2000)}\n---\n\nConversation so far:\n${conversationSoFar.map(m => `${m.role === "user" ? "You" : "Teacher"}: ${m.content}`).join("\n")}\n\nThe teacher just said: "${aiMessage}"\n\nRespond as this student would. Just the student's response, nothing else.`
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "I'm not sure";
}

async function runSession(
  studentId: number,
  studentName: string,
  level: number,
  articleId: number,
  articleTitle: string,
  articleBody: string,
  persona: StudentPersona,
) {
  console.log(`    📖 "${articleTitle}"`);

  // Create reading session
  const [session] = await sql`
    INSERT INTO reading_sessions (student_id, article_id, reading_completed_at)
    VALUES (${studentId}, ${articleId}, NOW())
    RETURNING id, started_at
  `;

  // Create conversation
  const [conv] = await sql`
    INSERT INTO conversations (reading_session_id, messages, complete)
    VALUES (${session.id}, '[]'::jsonb, false)
    RETURNING id
  `;

  // Load prompts
  const { comprehensionConversationPrompt, comprehensionReportPrompt, pickConversationStyle } = await import("../src/lib/prompts");
  
  const student = await sql`SELECT * FROM students WHERE id = ${studentId}`;
  const style = pickConversationStyle();
  
  const systemPrompt = comprehensionConversationPrompt(
    articleBody, level,
    JSON.stringify(student[0].interest_profile || {}),
    undefined, null, style
  );

  const messages: { role: string; content: string; timestamp: string }[] = [];
  
  messages.push({ role: "user", content: "I just finished reading the article.", timestamp: new Date().toISOString() });
  
  let complete = false;
  let turns = 0;

  while (!complete && turns < 8) {
    // AI guide response
    const aiRes = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 256,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    });

    const aiText = aiRes.content[0].type === "text" ? aiRes.content[0].text : "";
    complete = aiText.includes("[CONVERSATION_COMPLETE]");
    const cleanAI = aiText.replace("[CONVERSATION_COMPLETE]", "").trim();
    
    messages.push({ role: "assistant", content: cleanAI, timestamp: new Date().toISOString() });
    turns++;

    if (complete) break;

    // Simulated student response using persona
    const studentResponse = await simulateStudentResponse(articleBody, level, cleanAI, messages, persona);
    messages.push({ role: "user", content: studentResponse, timestamp: new Date().toISOString() });
    turns++;
  }

  // Save conversation
  await sql`UPDATE conversations SET messages = ${JSON.stringify(messages)}::jsonb, complete = true, conversation_style = ${style} WHERE id = ${conv.id}`;

  // Generate report
  const transcript = messages.map(m => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`).join("\n\n");
  const reportRes = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: comprehensionReportPrompt(articleBody, transcript, level) }],
  });

  const reportText = reportRes.content[0].type === "text" ? reportRes.content[0].text : "";
  const reportMatch = reportText.match(/\[REPORT\]\s*(\{[\s\S]*?\})/);
  
  let score = 65;
  if (reportMatch) {
    try {
      const report = JSON.parse(reportMatch[1]);
      score = report.score;

      const selfAssessment = pickSelfAssessment(persona, score);

      // Compute analytics
      const aiMsgs = messages.filter(m => m.role === "assistant");
      const studentMsgs = messages.filter(m => m.role === "user");
      const wc = (t: string) => t.split(/\s+/).filter(w => w.length > 0).length;
      const aiAvg = aiMsgs.length > 0 ? Math.round(aiMsgs.reduce((s, m) => s + wc(m.content), 0) / aiMsgs.length) : 0;
      const studentAvg = studentMsgs.length > 0 ? Math.round(studentMsgs.reduce((s, m) => s + wc(m.content), 0) / studentMsgs.length) : 0;
      const redirectPatterns = /\b(actually|take a look|take another look|close,? but|not quite|if you look at the article)\b/gi;
      const redirectCount = aiMsgs.reduce((c, m) => c + (m.content.match(redirectPatterns) || []).length, 0);

      await sql`INSERT INTO comprehension_reports (conversation_id, score, rating, understood, missed, engagement_note, self_assessment, ai_avg_words, student_avg_words, redirect_count, exchange_count)
        VALUES (${conv.id}, ${report.score}, ${report.rating}, ${report.understood}, ${report.missed}, ${report.engagement}, ${selfAssessment}, ${aiAvg}, ${studentAvg}, ${redirectCount}, ${studentMsgs.length})`;

      // Level adjustment
      let newLevel = level;
      if (report.score >= 85 && level < 6) newLevel = level + 1;
      else if (report.score < 40 && level > 1) newLevel = level - 1;

      if (newLevel !== level) {
        await sql`UPDATE students SET reading_level = ${newLevel} WHERE id = ${studentId}`;
        await sql`INSERT INTO level_history (student_id, from_level, to_level, triggered_by_session_id) VALUES (${studentId}, ${level}, ${newLevel}, ${session.id})`;
        console.log(`    📊 Level: L${level} → L${newLevel}`);
      }

      console.log(`    ✅ Score: ${score} | SA: ${selfAssessment} | ${messages.length} msgs | Style: ${style} | AI: ${aiAvg}w Student: ${studentAvg}w`);
    } catch (e) {
      console.log(`    ⚠️ Report parse error, using default score`);
    }
  } else {
    console.log(`    ⚠️ No report match, using default score`);
  }

  // Mark complete
  await sql`UPDATE articles SET read = true WHERE id = ${articleId}`;
  await sql`UPDATE reading_sessions SET completed_at = NOW() WHERE id = ${session.id}`;
  await sql`UPDATE students SET total_sessions_completed = total_sessions_completed + 1 WHERE id = ${studentId}`;
}

async function main() {
  console.log(`\n🤖 Student Activity Simulator\n`);
  console.log(`Sessions per student: ${sessionsPerStudent}`);
  if (targetStudents) console.log(`Target students: ${targetStudents.join(", ")}`);
  if (targetLevel) console.log(`Target level: ${targetLevel}`);
  if (dryRun) console.log(`Mode: DRY RUN`);
  console.log();

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
    const articles = await sql`SELECT id, title, body_text FROM articles 
      WHERE student_id = ${student.id} AND read = false
      ORDER BY RANDOM() LIMIT ${sessionsPerStudent}`;

    if (articles.length === 0) {
      console.log(`    ⚠️ No unread articles — skipping`);
      continue;
    }

    if (dryRun) {
      console.log(`    Would run ${articles.length} sessions:`);
      for (const a of articles) console.log(`      - ${a.title}`);
      continue;
    }

    for (const article of articles) {
      try {
        await runSession(student.id, student.name, student.reading_level, article.id, article.title, article.body_text, persona);
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
