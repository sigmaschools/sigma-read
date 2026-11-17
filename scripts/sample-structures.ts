/**
 * One sample article for each text structure (src/lib/batch/text-structure.ts), written with the
 * batch's own writer prompts from the model's knowledge and adapted to a reading level, for a
 * person to read before the batch uses them. No database; needs ANTHROPIC_API_KEY.
 * The batch also measures each article's reading level with Compass and may rewrite it once;
 * these samples skip that step.
 *
 *   npx tsx scripts/sample-structures.ts --level=3
 *
 * Writes structure-samples/samples.md and samples.json.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { writeFromKnowledge, adaptArticleToLevel, BASE_LEVEL, type SourcedTopic } from "../src/lib/batch/article-writer";
import { TEXT_STRUCTURES } from "../src/lib/batch/text-structure";

const level = Number(process.argv.find(a => a.startsWith("--level="))?.split("=")[1] ?? 3);

// One interest per structure, the kind a 10-year-old asks for
const TOPICS: Record<string, string> = {
  sequence: "how a rocket gets to space",
  cause_effect: "volcanoes",
  problem_solution: "robots",
  compare_contrast: "sharks",
  description: "Minecraft",
};

async function main() {
  const anthropic = new Anthropic();
  const results = await Promise.all(TEXT_STRUCTURES.map(async ({ id }) => {
    const topic: SourcedTopic = { query: TOPICS[id], type: "interest", sourceUrl: null, sourceText: "", structure: id };
    const base = await writeFromKnowledge(anthropic, topic);
    if (!base) return { asked: id, error: "writer gave no usable answer" };
    const adapted = level === BASE_LEVEL ? null : await adaptArticleToLevel(anthropic, base.title, base.bodyText, level);
    return {
      asked: id,
      named: base.textStructure,
      interest: TOPICS[id],
      title: adapted?.title ?? base.title,
      body: adapted?.bodyText ?? base.bodyText,
      words: (adapted?.bodyText ?? base.bodyText).split(/\s+/).filter(Boolean).length,
    };
  }));
  mkdirSync("structure-samples", { recursive: true });
  writeFileSync("structure-samples/samples.json", JSON.stringify({ level, results }, null, 2));
  const md = results.map(r => "error" in r
    ? `## ${r.asked}\n\nFailed: ${r.error}\n`
    : `## ${r.asked} (writer named: ${r.named ?? "none"}; interest: ${r.interest}; L${level}, ${r.words} words)\n\n### ${r.title}\n\n${r.body}\n`).join("\n---\n\n");
  writeFileSync("structure-samples/samples.md", `# Text structure samples, level ${level}\n\n${md}`);
  console.log(md);
  if (results.some(r => "error" in r)) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
