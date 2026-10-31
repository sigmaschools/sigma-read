/**
 * The guide-facing comprehension report for a finished conversation: generate it, store it,
 * record a strong-engagement interest signal, and run level progression.
 *
 * Shared by the chat route and scripts/simulate-students.ts, so simulated sessions produce
 * the same reports, signals and level changes real ones do.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/lib/db";
import { tracked } from "@/lib/ai-usage";
import { comprehensionReportPrompt } from "@/lib/prompts";
import { MODELS } from "@/lib/models";
import { REPORT_SCHEMA, REPORT_PROMPT_VERSION, reportConfidence, clampScore, ratingForScore, verifiedEvidence, type ComprehensionReport } from "@/lib/report-schema";
import { parseJsonResponse } from "@/lib/claude-json";
import { quietly, recordArticleSignal, recordChatMentions } from "@/lib/interest-graph";

/** A report this good, over this many student messages, counts as strong engagement with the topic */
const STRONG_ENGAGEMENT = { score: 80, exchanges: 4 };

/**
 * Generate the guide-facing comprehension report, store it, and run level progression.
 * Retries once if the model returns no usable report; on a second failure it logs and
 * skips, as before, so the student's session still completes. Alongside it, records any
 * interests the student brought up in the chat (independent of the report succeeding).
 */
export async function saveComprehensionReport(args: ReportArgs) {
  await Promise.all([
    saveReport(args),
    quietly(recordChatMentions({
      client: args.anthropic,
      studentId: args.studentId,
      articleId: args.articleId,
      articleTitle: args.articleTitle,
      conversationId: args.conversationId,
      studentMessages: args.messages.filter(m => m.role === "user").map(m => m.content),
    }).then(found => {
      // Slugs only: the student's own words can hold personal details
      if (found.length > 0) console.log(`Chat interests [conversation ${args.conversationId}]: ${found.map(f => f.topicSlug).join(", ")}`);
    }), "chat mentions"),
  ]);
}

interface ReportArgs {
  /** Untracked client; usage is logged here under the "report" feature */
  anthropic: Anthropic;
  conversationId: number;
  studentId: number;
  articleId: number;
  studentName: string;
  articleTitle: string;
  articleText: string;
  level: number;
  messages: { role: string; content: string }[];
  transcript: string;
  forcedClose: boolean;
  inChatScore: number;
}

async function saveReport(args: ReportArgs) {
  let report: ComprehensionReport | null = null;
  for (let attempt = 1; attempt <= 2 && !report; attempt++) {
    try {
      const reportResponse = await tracked(args.anthropic, "report", args.studentId).messages.create({
        model: MODELS.heavy,
        max_tokens: 2048,
        messages: [{ role: "user", content: comprehensionReportPrompt(args.articleText, args.transcript, args.level) }],
        output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
      });
      report = parseJsonResponse<ComprehensionReport>(reportResponse);
      if (!report) {
        console.error(`Report attempt ${attempt} unusable (stop_reason: ${reportResponse.stop_reason})`);
        // A refusal won't change on an identical retry
        if (reportResponse.stop_reason === "refusal") break;
      }
    } catch (e) {
      console.error(`Report attempt ${attempt} failed:`, e);
    }
  }
  if (!report) {
    console.error(`No comprehension report for conversation ${args.conversationId}`);
    return;
  }

  // Conversation analytics
  const aiMessages = args.messages.filter(m => m.role === "assistant");
  const studentMessages = args.messages.filter(m => m.role === "user");
  const wordCount = (text: string) => text.split(/\s+/).filter(w => w.length > 0).length;
  const aiAvgWords = aiMessages.length > 0 ? Math.round(aiMessages.reduce((sum, m) => sum + wordCount(m.content), 0) / aiMessages.length) : 0;
  const studentAvgWords = studentMessages.length > 0 ? Math.round(studentMessages.reduce((sum, m) => sum + wordCount(m.content), 0) / studentMessages.length) : 0;
  // Count redirections: "actually", "take a look", "take another look", "close, but", "not quite"
  const redirectPatterns = /\b(actually|take a look|take another look|close,? but|not quite|if you look at the article)\b/gi;
  const redirectCount = aiMessages.reduce((count, m) => count + (m.content.match(redirectPatterns) || []).length, 0);
  const exchangeCount = studentMessages.length;

  const score = clampScore(report.score);
  await db.insert(schema.comprehensionReports).values({
    conversationId: args.conversationId,
    score,
    rating: ratingForScore(score),
    understood: report.comprehension,
    missed: report.depth,
    engagementNote: report.engagement,
    aiAvgWords,
    studentAvgWords,
    redirectCount,
    exchangeCount,
    skills: report.skills,
    evidence: verifiedEvidence(report.evidence, studentMessages.map(m => m.content)),
    summary: report.summary,
    nextStep: report.nextStep,
    confidence: reportConfidence({ forcedClose: args.forcedClose, exchangeCount, studentAvgWords }),
    forcedClose: args.forcedClose,
    inChatScore: args.inChatScore,
    model: MODELS.heavy,
    promptVersion: REPORT_PROMPT_VERSION,
  });

  // A long, strong discussion is a sign the topic landed
  if (score >= STRONG_ENGAGEMENT.score && exchangeCount >= STRONG_ENGAGEMENT.exchanges && !args.forcedClose) {
    await quietly(recordArticleSignal(args.studentId, args.articleId, "strong_engagement", `report:${args.conversationId}`), "strong engagement");
  }

  // Gradual Mix Level Progression — evaluate and apply
  try {
    const { evaluateProgression, applyProgressionResult } = await import("@/lib/level-progression");
    const progressionResult = await evaluateProgression(args.studentId);
    if (progressionResult.action !== "none") {
      await applyProgressionResult(args.studentId, progressionResult);
      console.log(`Level progression [${args.studentName}]: ${progressionResult.action}`,
        progressionResult.newLevel ? `→ L${progressionResult.newLevel}` : "",
        progressionResult.alertMessage || "");
    }
  } catch (e) {
    console.error("Level progression error:", e);
  }
}
