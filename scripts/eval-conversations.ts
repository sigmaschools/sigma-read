/**
 * Offline conversation eval: simulated students talk with the real tutor prompt, then the
 * real report prompt grades each conversation. Nothing is written to a database.
 *
 * Usage (needs ANTHROPIC_API_KEY only):
 *   npm run eval
 *   npm run eval -- --personas=emma,marcus --articles=octopus --runs=2
 *   npm run eval -- --label=after-prompt-fix --no-report
 *   npm run eval -- --style=SURPRISE --runs=3   # pin the style and repeat to reduce noise
 *
 * Writes eval-results/<time>-<label>/results.jsonl (one line per conversation, with transcript)
 * and summary.md (rule violations, exchanges, progress, report scores). Compare two runs'
 * summaries to judge a prompt change.
 *
 * Personas come from scripts/test-personas.ts. Never simulates real students.
 */

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONAS, EXCLUDED_USERNAMES, type StudentPersona } from "./test-personas";
import { EVAL_ARTICLES, type EvalArticle } from "./eval/articles";
import { buildStudentSystemPrompt } from "./eval/student-sim";
import { checkTranscript, wordCount, type Msg, type Violation } from "./eval/checks";
import { comprehensionConversationPrompt, comprehensionReportPrompt, pickConversationStyle } from "../src/lib/prompts";
import { runTutorTurn, type ClosingKind } from "../src/lib/conversation-turn";
import { REPORT_SCHEMA, type ComprehensionReport } from "../src/lib/report-schema";
import { parseJsonResponse } from "../src/lib/claude-json";
import { MODELS } from "../src/lib/models";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}
const anthropic = new Anthropic();

const args = process.argv.slice(2);
const getArg = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const intArg = (name: string, fallback: number) => {
  const n = parseInt(getArg(name) ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const listArg = (name: string) => getArg(name)?.split(",").filter(Boolean) ?? null;

// Child personas only by default: "wayne" is an adult boundary-tester
const DEFAULT_SKIP = [...EXCLUDED_USERNAMES, "wayne"];
const personaNames = listArg("personas");
const personas = PERSONAS.filter(p => personaNames ? personaNames.includes(p.username) : !DEFAULT_SKIP.includes(p.username))
  .filter(p => !EXCLUDED_USERNAMES.includes(p.username));
const articleIds = listArg("articles");
const articles = EVAL_ARTICLES.filter(a => !articleIds || articleIds.includes(a.id));
const runs = intArg("runs", 1);
const concurrency = intArg("concurrency", 3);
// Pin one conversation style so a before/after comparison isn't confounded by the random pick
const fixedStyle = getArg("style");
const withReport = !args.includes("--no-report");
const label = (getArg("label") || "run").replace(/[^\w.=-]+/g, "-");

/** Guard against a runaway loop; the tutor's own backstop closes at 6 student messages */
const MAX_TURNS = 10;

interface Result {
  persona: string;
  article: string;
  level: number;
  style: string;
  exchanges: number;
  progress: number;
  deltas: number[];
  closing: ClosingKind | null;
  tutorAvgWords: number;
  studentAvgWords: number;
  violations: Violation[];
  report: Pick<ComprehensionReport, "score" | "rating" | "skills" | "summary" | "nextStep"> | null;
  transcript: Msg[];
  error?: string;
}

async function studentReply(persona: StudentPersona, article: EvalArticle, transcript: Msg[]): Promise<string> {
  const last = transcript[transcript.length - 1].content;
  const res = await anthropic.messages.create({
    model: MODELS.standard,
    max_tokens: 200,
    system: buildStudentSystemPrompt(persona, article.level),
    messages: [{
      role: "user",
      content: `Article you just read:\n---\n${article.bodyText}\n---\n\nConversation so far:\n${transcript.map(m => `${m.role === "user" ? "You" : "Teacher"}: ${m.content}`).join("\n")}\n\nThe teacher just said: "${last}"\n\nRespond as this student would. Just the student's response, nothing else.`,
    }],
  });
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  return text || "idk";
}

async function runConversation(persona: StudentPersona, article: EvalArticle): Promise<Result> {
  const style = fixedStyle || pickConversationStyle();
  const systemPrompt = comprehensionConversationPrompt(
    article.bodyText, article.level, JSON.stringify({ interests: persona.interests }), undefined, null, style,
  );

  const transcript: Msg[] = [];
  const deltas: number[] = [];
  let progress = 0;
  let closing: ClosingKind | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const result = await runTutorTurn({ client: anthropic, model: MODELS.heavy, systemPrompt, messages: transcript, priorProgress: progress });
    if (transcript.length > 0) deltas.push(result.progressDelta);
    progress = result.progressScore;
    transcript.push({ role: "assistant", content: result.message });
    if (result.complete) { closing = result.closing; break; }
    transcript.push({ role: "user", content: await studentReply(persona, article, transcript) });
  }

  const closingIndex = closing ? transcript.length - 1 : null;
  const tutorMsgs = transcript.filter(m => m.role === "assistant");
  const studentMsgs = transcript.filter(m => m.role === "user");
  const avg = (ms: Msg[]) => ms.length ? Math.round(ms.reduce((s, m) => s + wordCount(m.content), 0) / ms.length) : 0;

  let report: Result["report"] = null;
  if (withReport) {
    // A failed report shouldn't throw away a finished transcript
    try {
      const text = transcript.map(m => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`).join("\n\n");
      const res = await anthropic.messages.create({
        model: MODELS.heavy,
        max_tokens: 2048,
        messages: [{ role: "user", content: comprehensionReportPrompt(article.bodyText, text, article.level) }],
        output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
      });
      const parsed = parseJsonResponse<ComprehensionReport>(res);
      if (parsed) report = { score: parsed.score, rating: parsed.rating, skills: parsed.skills, summary: parsed.summary, nextStep: parsed.nextStep };
    } catch (e) {
      console.log(`  ${persona.username} / ${article.id}: report failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  return {
    persona: persona.username,
    article: article.id,
    level: article.level,
    style,
    exchanges: studentMsgs.length,
    progress,
    deltas,
    closing,
    tutorAvgWords: avg(tutorMsgs),
    studentAvgWords: avg(studentMsgs),
    violations: checkTranscript(transcript, article.level, closingIndex),
    report,
    transcript,
  };
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

function summarize(results: Result[]): string {
  const ok = results.filter(r => !r.error);
  const lines: string[] = [];
  lines.push(`# Conversation eval: ${label}`, "");
  lines.push(`${ok.length} conversations (${results.length - ok.length} errors). Tutor ${MODELS.heavy}, student sim ${MODELS.standard}.`, "");

  const byRule = new Map<string, number>();
  ok.forEach(r => r.violations.forEach(v => byRule.set(v.rule, (byRule.get(v.rule) || 0) + 1)));
  const tutorTurns = ok.reduce((s, r) => s + r.transcript.filter(m => m.role === "assistant").length, 0);
  lines.push("## Rule violations", "", `Across ${tutorTurns} tutor messages.`, "");
  if (byRule.size === 0) lines.push("None.");
  else {
    lines.push("| Rule | Count |", "| --- | --- |");
    [...byRule.entries()].sort((a, b) => b[1] - a[1]).forEach(([rule, n]) => lines.push(`| ${rule} | ${n} |`));
  }
  lines.push("");

  lines.push("## By level", "", "| Level | Conversations | Avg exchanges | Forced closes | Avg report score | Tutor avg words |", "| --- | --- | --- | --- | --- | --- |");
  for (const level of [...new Set(ok.map(r => r.level))].sort()) {
    const rs = ok.filter(r => r.level === level);
    const mean = (xs: number[]) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "-";
    lines.push(`| L${level} | ${rs.length} | ${mean(rs.map(r => r.exchanges))} | ${rs.filter(r => r.closing === "forced").length} | ${mean(rs.flatMap(r => r.report ? [r.report.score] : []))} | ${mean(rs.map(r => r.tutorAvgWords))} |`);
  }
  lines.push("");

  lines.push("## Conversations", "", "| Persona | Article | Style | Exchanges | Deltas | Close | Score | Violations |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    if (r.error) { lines.push(`| ${r.persona} | ${r.article} | - | - | - | error | - | ${r.error} |`); continue; }
    lines.push(`| ${r.persona} | ${r.article} | ${r.style} | ${r.exchanges} | ${r.deltas.join(" ")} | ${r.closing ?? "none"} | ${r.report?.score ?? "-"} | ${r.violations.map(v => v.rule).join(", ") || "-"} |`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const jobs = personas.flatMap(p => articles.flatMap(a => Array.from({ length: runs }, () => ({ p, a }))));
  const dir = join("eval-results", `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`);
  mkdirSync(dir, { recursive: true });
  console.log(`Running ${jobs.length} conversations (${personas.length} personas x ${articles.length} articles x ${runs}) → ${dir}`);

  const results: Result[] = [];
  await runPool(jobs, concurrency, async ({ p, a }) => {
    let r: Result;
    try {
      r = await runConversation(p, a);
      console.log(`  ${p.username} / ${a.id}: ${r.exchanges} exchanges, ${r.closing ?? "no close"}, score ${r.report?.score ?? "-"}, ${r.violations.length} violations`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`  ${p.username} / ${a.id}: error: ${error}`);
      r = { persona: p.username, article: a.id, level: a.level, style: "", exchanges: 0, progress: 0, deltas: [], closing: null, tutorAvgWords: 0, studentAvgWords: 0, violations: [], report: null, transcript: [], error };
    }
    results.push(r);
    appendFileSync(join(dir, "results.jsonl"), JSON.stringify(r) + "\n");
  });

  // Stable order so two runs' summaries can be compared line by line
  results.sort((x, y) => x.persona.localeCompare(y.persona) || x.article.localeCompare(y.article));
  writeFileSync(join(dir, "summary.md"), summarize(results));
  console.log(`\nSummary: ${join(dir, "summary.md")}`);
}

main().catch(e => { console.error(e); process.exit(1); });
