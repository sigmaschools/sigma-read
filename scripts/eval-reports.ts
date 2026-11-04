/**
 * Comprehension-report model comparison: the same finished conversations reported on by each
 * candidate model, with the real report prompt and schema. Each report is graded blind by a judge
 * model that is not a candidate, which also writes its own reference score for every conversation.
 *
 *   npm run eval:reports -- <results.jsonl from eval:models> [--tutor sonnet-5-5-nothink] [--limit 24]
 *
 * Needs ANTHROPIC_API_KEY only. Output: eval-results/reports-<time>/.
 */

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EVAL_ARTICLES } from "./eval/articles";
import { comprehensionReportPrompt } from "../src/lib/prompts";
import { REPORT_SCHEMA, clampScore, verifiedEvidence, type ComprehensionReport } from "../src/lib/report-schema";
import { costUsd } from "../src/lib/ai-pricing";

const anthropic = new Anthropic();
const JUDGE_MODEL = "claude-fable-5-1";

interface Config { id: string; model: string; settings: Record<string, unknown> }
const CONFIGS: Config[] = [
  { id: "opus-4-6", model: "claude-opus-4-6", settings: {} },
  { id: "opus-5-5-low", model: "claude-opus-5-5", settings: { effort: "low" } },
  { id: "sonnet-5-5-low", model: "claude-sonnet-5-5", settings: { effort: "low" } },
  { id: "sonnet-5-5-nothink", model: "claude-sonnet-5-5", settings: { thinking: { type: "between_tools" } } },
  { id: "haiku-5-5-low", model: "claude-haiku-5-5", settings: { effort: "low" } },
];

interface Row { config: string; persona: string; article: string; level: number; transcript: { role: string; content: string }[] }

function args() {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : null; };
  return { file: a.find(x => x.endsWith(".jsonl")), tutor: get("--tutor") ?? "sonnet-5-5-nothink", limit: Number(get("--limit") ?? 24) };
}

const transcriptText = (t: Row["transcript"]) => t.map(m => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`).join("\n\n");

async function report(row: Row, model: string, settings: Record<string, unknown>) {
  const article = EVAL_ARTICLES.find(a => a.id === row.article)!;
  const { effort, ...rest } = settings as { effort?: string };
  const t = Date.now();
  const r = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    ...rest,
    messages: [{ role: "user", content: comprehensionReportPrompt(article.bodyText, transcriptText(row.transcript), row.level) }],
    output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA }, ...(effort ? { effort } : {}) },
  } as Anthropic.MessageCreateParamsNonStreaming);
  const text = r.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
  let parsed: ComprehensionReport | null = null;
  try { parsed = r.stop_reason === "end_turn" ? JSON.parse(text) : null; } catch { parsed = null; }
  return { report: parsed, ms: Date.now() - t, cost: costUsd(model, r.usage) ?? 0 };
}

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    unsupported: { type: "array", items: { type: "string" }, description: "Claims in the report about the student that the transcript does not support" },
    accuracy: { type: "integer", description: "1-5: every statement about the student is borne out by the transcript" },
    fair_score: { type: "integer", description: "1-5: the score and skill ratings fit what the student showed, for their grade level" },
    useful: { type: "integer", description: "1-5: a guide or parent learns something specific and can act on the next step" },
    overall: { type: "integer", description: "1-10: overall quality of this report" },
    comment: { type: "string" },
  },
  required: ["unsupported", "accuracy", "fair_score", "useful", "overall", "comment"],
  additionalProperties: false,
} as const;
type Judgement = { unsupported: string[]; accuracy: number; fair_score: number; useful: number; overall: number; comment: string };

async function judge(row: Row, rep: ComprehensionReport): Promise<Judgement | null> {
  const article = EVAL_ARTICLES.find(a => a.id === row.article)!;
  const prompt = `A children's reading app writes a comprehension report for the student's guide after each article discussion. The report's score (1-100) feeds the student's reading-level changes, so it must be fair and grounded. Grade this report strictly against the transcript. The student read the article at level ${row.level} (of 6).

ARTICLE:
${article.bodyText}

TRANSCRIPT:
${transcriptText(row.transcript)}

REPORT:
${JSON.stringify(rep, null, 1)}`;
  try {
    const r = await anthropic.messages.create({
      model: JUDGE_MODEL, max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: JUDGE_SCHEMA }, effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    return JSON.parse(r.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join(""));
  } catch (e) { console.error("judge failed:", (e as Error).message); return null; }
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) await fn(items[next++]); }));
}

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const f = (x: number, d = 1) => Number.isFinite(x) ? x.toFixed(d) : "-";

async function main() {
  const opt = args();
  if (!opt.file) { console.error("Pass a results.jsonl from npm run eval:models"); process.exit(1); }
  const rows = readFileSync(opt.file, "utf8").trim().split("\n").map(l => JSON.parse(l) as Row)
    .filter(r => r.config === opt.tutor && r.transcript?.length > 2).slice(0, opt.limit);
  const dir = join("eval-results", `reports-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dir, { recursive: true });
  console.log(`${rows.length} conversations × ${CONFIGS.length} models → ${dir}`);

  // Reference: the judge model writes its own report, at medium effort
  const reference = new Map<number, number>();
  await runPool(rows.map((r, i) => ({ r, i })), 6, async ({ r, i }) => {
    const ref = await report(r, JUDGE_MODEL, { effort: "medium" }).catch(() => null);
    if (ref?.report) reference.set(i, clampScore(ref.report.score));
  });

  type Out = { config: string; i: number; persona: string; article: string; score: number | null; refScore: number | null; evidenceKept: number; ms: number; cost: number; judge: Judgement | null };
  const out: Out[] = [];
  await runPool(CONFIGS.flatMap(c => rows.map((r, i) => ({ c, r, i }))), 6, async ({ c, r, i }) => {
    const res = await report(r, c.model, c.settings).catch(e => { console.error(c.id, (e as Error).message); return null; });
    const rep = res?.report ?? null;
    const said = r.transcript.filter(m => m.role === "user").map(m => m.content);
    const evidenceKept = rep && rep.evidence.length ? verifiedEvidence(rep.evidence, said).length / rep.evidence.length : 1;
    const j = rep ? await judge(r, rep) : null;
    out.push({ config: c.id, i, persona: r.persona, article: r.article, score: rep ? clampScore(rep.score) : null, refScore: reference.get(i) ?? null, evidenceKept, ms: res?.ms ?? 0, cost: res?.cost ?? 0, judge: j });
    console.log(`  ${c.id} #${i} ${r.persona}/${r.article}: score ${rep?.score ?? "-"} (ref ${reference.get(i) ?? "-"}), judge ${j?.overall ?? "-"}`);
  });
  writeFileSync(join(dir, "results.json"), JSON.stringify(out, null, 1));

  const base = CONFIGS[0].id;
  const lines = [
    "# Comprehension report model comparison", "",
    `${rows.length} conversations (tutor ${opt.tutor}), each reported on by every model with the production prompt and schema. Judge ${JUDGE_MODEL}, blind to the model; reference score = the judge model's own report at medium effort.`, "",
    "| Model | Reports | Judge overall /10 | Accuracy | Fair score | Useful | Unsupported claims | Score gap to reference (mean abs) | Score gap to " + base + " | Evidence quotes verified | Median time | Cost / report |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const c of CONFIGS) {
    const rs = out.filter(o => o.config === c.id);
    const ok = rs.filter(o => o.score !== null);
    const j = ok.map(o => o.judge).filter((x): x is Judgement => !!x);
    const refGap = ok.filter(o => o.refScore !== null).map(o => Math.abs(o.score! - o.refScore!));
    const baseGap = ok.map(o => { const b = out.find(x => x.config === base && x.i === o.i); return b?.score != null ? Math.abs(o.score! - b.score) : NaN; }).filter(Number.isFinite);
    const ms = [...ok.map(o => o.ms)].sort((a, b) => a - b);
    lines.push(`| ${c.id} | ${ok.length}/${rs.length} | ${f(mean(j.map(x => x.overall)))} | ${f(mean(j.map(x => x.accuracy)))} | ${f(mean(j.map(x => x.fair_score)))} | ${f(mean(j.map(x => x.useful)))} | ${f(mean(j.map(x => x.unsupported.length)))} | ${f(mean(refGap))} | ${c.id === base ? "-" : f(mean(baseGap))} | ${Math.round(100 * mean(ok.map(o => o.evidenceKept)))}% | ${f((ms[Math.floor(ms.length / 2)] ?? NaN) / 1000)} s | $${f(mean(ok.map(o => o.cost)), 4)} |`);
  }
  lines.push("", "## Judge comments", "");
  for (const o of out) if (o.judge) lines.push(`- **${o.config} / ${o.persona} / ${o.article}** (score ${o.score}, ref ${o.refScore}; ${o.judge.overall}/10): ${o.judge.comment}`);
  writeFileSync(join(dir, "summary.md"), lines.join("\n") + "\n");
  console.log("\n" + lines.join("\n").split("## Judge comments")[0]);
}

main().catch(e => { console.error(e); process.exit(1); });
