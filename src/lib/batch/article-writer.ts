/**
 * Writing a shared article: rewrite a web source at the base level, then adapt it to other levels.
 * Used by the morning batch, new students' first articles and the article eval
 * (scripts/eval-articles.ts), so all three run the same prompts. No database access here.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { MODELS, requestSettings } from "../models";

export const BASE_LEVEL = 4;

export const levelGuide: Record<number, { lexile: string; grade: string; words: string; vocab: string }> = {
  1: { lexile: "~400-500", grade: "2-3", words: "100-200", vocab: "Use simple, common words. Short sentences (5-10 words). Define any topic word in the same sentence." },
  2: { lexile: "~550-650", grade: "3-4", words: "200-300", vocab: "Mostly common words. At most 1-2 topic-specific words per paragraph, explained in context." },
  3: { lexile: "~700-800", grade: "5-6", words: "300-400", vocab: "At most 2-3 challenging words per paragraph. Each one defined or contextually clear." },
  4: { lexile: "~850-950", grade: "7", words: "400-500", vocab: "Domain vocabulary with context clues. Avoid stacking multiple technical terms in one sentence." },
  5: { lexile: "~1000-1100", grade: "8", words: "400-600", vocab: "Domain-specific vocabulary supported by context. Complex sentence structures allowed." },
  6: { lexile: "~1150+", grade: "8+", words: "500-600", vocab: "Advanced vocabulary acceptable. Assume strong reader who can handle nuance and inference." },
};

export interface SourcedTopic {
  query: string;
  type: "interest" | "news" | "horizon";
  sourceUrl: string;
  sourceText: string;
}

export interface BaseArticle {
  title: string; topic: string; bodyText: string; sourceUrl: string;
  sources: string[]; estimatedReadTime: number; category: string;
}

/** Only messages.create is used, so a usage-tracked client works too */
type Client = { messages: Pick<Anthropic["messages"], "create"> };

export interface WriterOptions {
  /** Defaults to the article-writing model and its settings in models.ts */
  model?: string;
  /** Extra request fields (thinking, output_config.effort) for a model under test */
  settings?: Record<string, unknown>;
}

const BANNED_OPENINGS = ["imagine ", "picture this", "picture yourself", "what if ", "have you ever"];

export function hasBannedOpening(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return BANNED_OPENINGS.some(phrase => lower.startsWith(phrase));
}

function text(response: Anthropic.Message): string {
  return response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
}

function request(opts: WriterOptions | undefined) {
  const model = opts?.model ?? MODELS.writer;
  return { model, ...(opts?.settings ?? requestSettings(model, "writer")) };
}

export function rewritePrompt(topic: SourcedTopic): string {
  const guide = levelGuide[BASE_LEVEL];
  // Truncate source text to ~2000 words to keep prompt reasonable
  const sourceWords = topic.sourceText.split(/\s+/);
  const truncatedSource = sourceWords.length > 2000
    ? sourceWords.slice(0, 2000).join(" ") + "..."
    : topic.sourceText;

  return `Rewrite the following source material as an original nonfiction article for a student.

Reading level: ${BASE_LEVEL} (Lexile ${guide.lexile}, Grade ${guide.grade})
Article type: ${topic.type}
Target length: ${guide.words} words

SOURCE MATERIAL:
${truncatedSource}

VOCABULARY RULES: ${guide.vocab}

Requirements:
- Rewrite the source material as an ORIGINAL article. Keep all facts accurate. Do not add information not in the source.
- Do NOT copy sentences verbatim from the source. Use your own words and structure.
- Calibrate sentence length and complexity to the grade level.
- Make it genuinely interesting. Concrete details and examples throughout.
- OPENING STYLE — HARD RULE: Your FIRST WORD must NOT be "Imagine", "Picture", "What", or "Have". These are hard-banned. Before writing the article, silently pick ONE style from this list and write only that style:
  1. Statistic: Lead with a striking number. E.g., "Every second, 6,000 lightning bolts hit Earth."
  2. Scene drop: Real moment, third-person present tense. E.g., "A coyote trots down a Chicago sidewalk at 2 a.m."
  3. Historical moment: Specific time and place. E.g., "On July 20, 1969, two astronauts stepped onto a world no human had touched."
  4. Bold claim: A surprising fact. E.g., "Coyotes have spread farther than any other predator in North America in the last century."
  5. Contrast: Two opposing facts. E.g., "The drone weighs less than a smartphone. It can carry 20 pounds for 30 miles."
  6. Q&A: Ask, then answer immediately. E.g., "How fast is the fastest animal? The peregrine falcon dives at 240 mph."
  7. Micro-story: One sentence about a real person or event. E.g., "At nine years old, Ai Hinatsuru showed up at a stranger's door demanding to be taught."
  Do not use style 1 twice in the same batch.
- Short paragraphs (2-4 sentences each).
- Age-appropriate for grade ${guide.grade} students.
- EDITORIAL NEUTRALITY: Report facts, not opinions.
${topic.type === "news" ? "- Frame around what is happening NOW." : ""}
${topic.type === "horizon" ? "- Introduce the domain with curiosity — this should feel like a discovery." : ""}

Output format:
[ARTICLE]
{
  "title": "Article title",
  "topic": "Topic tag (1-3 words)",
  "body": "The full article text.",
  "estimated_read_time_minutes": 3
}

No preamble or commentary outside the JSON.`;
}

export function parseRewrite(raw: string, topic: SourcedTopic): BaseArticle | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.title || !parsed.body) return null;
    if (hasBannedOpening(parsed.body)) {
      const preview = parsed.body.trim().split(" ").slice(0, 4).join(" ");
      console.log(`  ⚠️  Banned opening detected: "${preview}..." — article still used, check prompt`);
    }
    return {
      title: parsed.title,
      topic: parsed.topic || topic.query,
      bodyText: parsed.body,
      sourceUrl: topic.sourceUrl,
      sources: [topic.sourceUrl],
      estimatedReadTime: parsed.estimated_read_time_minutes || 3,
      category: topic.type === "interest" ? "interest" : topic.type === "news" ? "news" : "general",
    };
  } catch { return null; }
}

/** Rewrites a web source as an original article at the base level */
export async function rewriteFromSource(client: Client, topic: SourcedTopic, opts?: WriterOptions): Promise<BaseArticle | null> {
  const response = await client.messages.create({
    ...request(opts),
    max_tokens: 4000,
    messages: [{ role: "user", content: rewritePrompt(topic) }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  return parseRewrite(text(response), topic);
}

export function adaptPrompt(baseTitle: string, baseBody: string, targetLevel: number): string {
  const guide = levelGuide[targetLevel];
  return `Adapt this article to reading level ${targetLevel} (Lexile ${guide.lexile}, Grade ${guide.grade}, ${guide.words} words). Keep same facts, adjust vocabulary/complexity.

${guide.vocab}

Title: ${baseTitle}
---
${baseBody}
---

Rules:
- Keep the same title (or simplify for lower levels)
- Keep all key facts accurate
- Adjust sentence length and vocabulary to match target grade
- Short paragraphs (2-4 sentences)
- OPENING STYLE: Preserve the base article's opening style. If the original opens with a statistic, scene, historical moment, bold claim, contrast, Q&A, or micro-story — keep that approach. If the original starts with "Imagine", "Picture", "What if", or "Have you ever" — replace it with a surprising fact, scene, or historical moment.

Output ONLY JSON:
{"title": "Article title", "body": "Adapted article text.", "estimated_read_time_minutes": ${targetLevel <= 2 ? 2 : targetLevel <= 4 ? 3 : 4}}`;
}

export function parseAdapt(raw: string, baseTitle: string): { title: string; bodyText: string; estimatedReadTime: number } | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.body) return null;
    return { title: parsed.title || baseTitle, bodyText: parsed.body, estimatedReadTime: parsed.estimated_read_time_minutes || 3 };
  } catch { return null; }
}

/** Adapts a base article to another reading level, keeping its facts */
export async function adaptArticleToLevel(
  client: Client, baseTitle: string, baseBody: string, targetLevel: number, opts?: WriterOptions,
): Promise<{ title: string; bodyText: string; estimatedReadTime: number } | null> {
  const response = await client.messages.create({
    ...request(opts),
    max_tokens: 4000,
    messages: [{ role: "user", content: adaptPrompt(baseTitle, baseBody, targetLevel) }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  return parseAdapt(text(response), baseTitle);
}
