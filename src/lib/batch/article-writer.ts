/**
 * Writing a shared article: rewrite a web source at the base level, then adapt it to other levels.
 * Used by the morning batch, new students' first articles and the article eval
 * (scripts/eval-articles.ts), so all three run the same prompts. No database access here.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { MODELS, requestSettings } from "../models";
import type { StoryAngle } from "./story-angles";

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
  /** The interest or news topic the article is for, in the student's words */
  query: string;
  type: "interest" | "news" | "horizon";
  /** The page the article is rewritten from; null when no page fit and it is written from the model's own knowledge */
  sourceUrl: string | null;
  sourceText: string;
  /** The one story to tell (story-angles.ts); the interest itself when absent */
  angle?: StoryAngle;
}

export interface BaseArticle {
  title: string; topic: string; bodyText: string; sourceUrl: string | null;
  sources: string[]; estimatedReadTime: number; category: string;
}

/** Only messages.create is used, so a usage-tracked client works too */
type Client = { messages: Pick<Anthropic["messages"], "create"> };

export interface WriterOptions {
  /** Defaults to the article-writing model and its settings in models.ts */
  model?: string;
  /** Extra request fields (thinking, output_config.effort) for a model under test */
  settings?: Record<string, unknown>;
  /**
   * What to aim at for the level, from Compass's reading-level measure (src/lib/reading-level.ts):
   * a sentence on sentence length and vocabulary. Absent when Compass didn't answer; the prompt
   * is then what it was before the measure.
   */
  guidance?: string;
}

/** The guidance line for a writer's prompt; nothing when there is no guidance */
export function guidanceLine(guidance: string | undefined): string {
  return guidance ? `\nSENTENCES AND WORDS: ${guidance} This sets the reading level: where it differs from the grade or the vocabulary rules, follow it.\n` : "";
}

/** How an article body is written; the reader renders it with src/lib/markdown.ts */
export const ARTICLE_FORMAT = `- FORMAT: Markdown. Separate paragraphs with a blank line. Subheadings are optional; when you use one, put it on its own line as "## Subheading", never as a bold line like "**Subheading**". Don't repeat the title as a heading. Use **bold** or *italics* sparingly, and no HTML.`;

/** The one story the article tells, for the writer's brief (story-angles.ts); the interest itself when the batch had no angle */
export function storyBrief(topic: SourcedTopic): string {
  const angle = topic.angle;
  if (!angle || angle.angle.toLowerCase() === topic.query.toLowerCase()) {
    return `\nTHE STORY: one specific, concrete story about "${topic.query}" for a kid who loves it. Pick the single most surprising thing in the material and build the article around it.\n`;
  }
  return `\nTHE STORY: ${angle.angle}${angle.why ? ` (${angle.why.replace(/\.$/, "")})` : ""}. The reader asked for "${topic.query}"; this is the story you picked for them.\n`;
}

const OPENING_RULE = `- OPENING STYLE — HARD RULE: Your FIRST WORD must NOT be "Imagine", "Picture", "What", or "Have". These are hard-banned. Before writing the article, silently pick ONE style from this list and write only that style:
  1. Statistic: Lead with a striking number. E.g., "Every second, 6,000 lightning bolts hit Earth."
  2. Scene drop: Real moment, third-person present tense. E.g., "A coyote trots down a Chicago sidewalk at 2 a.m."
  3. Historical moment: Specific time and place. E.g., "On July 20, 1969, two astronauts stepped onto a world no human had touched."
  4. Bold claim: A surprising fact. E.g., "Coyotes have spread farther than any other predator in North America in the last century."
  5. Contrast: Two opposing facts. E.g., "The drone weighs less than a smartphone. It can carry 20 pounds for 30 miles."
  6. Q&A: Ask, then answer immediately. E.g., "How fast is the fastest animal? The peregrine falcon dives at 240 mph."
  7. Micro-story: One sentence about a real person or event. E.g., "At nine years old, Ai Hinatsuru showed up at a stranger's door demanding to be taught."
  Do not use style 1 twice in the same batch.`;

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

export function rewritePrompt(topic: SourcedTopic, guidance?: string): string {
  const guide = levelGuide[BASE_LEVEL];
  // Truncate source text to ~2000 words to keep prompt reasonable
  const sourceWords = topic.sourceText.split(/\s+/);
  const truncatedSource = sourceWords.length > 2000
    ? sourceWords.slice(0, 2000).join(" ") + "..."
    : topic.sourceText;

  return `Write an original nonfiction article for a student from the source material below.

Reading level: ${BASE_LEVEL} (Lexile ${guide.lexile}, Grade ${guide.grade})
Article type: ${topic.type}
Target length: ${guide.words} words
${storyBrief(topic)}
SOURCE MATERIAL:
${truncatedSource}

VOCABULARY RULES: ${guide.vocab}
${guidanceLine(guidance)}
Requirements:
- Tell ONE story well, the one in the brief. The source is your fact-check, not your outline: leave out everything in it that doesn't serve the story, even most of the page. Never a general overview of the subject.
- Every fact, number, name and date must come from the source. Do not add information not in the source.
- Do NOT copy sentences verbatim from the source. Use your own words and structure.
- Calibrate sentence length and complexity to the grade level.
- Make it genuinely interesting. Concrete details and examples throughout.
${OPENING_RULE}
- Short paragraphs (2-4 sentences each).
${ARTICLE_FORMAT}
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
      sources: topic.sourceUrl ? [topic.sourceUrl] : [],
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
    messages: [{ role: "user", content: rewritePrompt(topic, opts?.guidance) }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  return parseRewrite(text(response), topic);
}

/**
 * When no page about the story could be found, the article is written from what the model knows,
 * the way the spring 2026 articles were (StarCraft and swarm robots, the physics of a Nerf
 * blaster). It is marked for review (article_cache.review_note), since nothing checks it against a page.
 */
export function knowledgePrompt(topic: SourcedTopic, guidance?: string): string {
  const guide = levelGuide[BASE_LEVEL];
  return `Write an original nonfiction article for a student, from your own knowledge.

Reading level: ${BASE_LEVEL} (Lexile ${guide.lexile}, Grade ${guide.grade})
Article type: ${topic.type}
Target length: ${guide.words} words
${storyBrief(topic)}
VOCABULARY RULES: ${guide.vocab}
${guidanceLine(guidance)}
Requirements:
- Tell ONE story well, the one in the brief. Never a general overview of the subject.
- Use only facts you are confident are true and well documented. No invented quotes, statistics, studies or people. If you are not sure of a number or a date, leave it out or round it ("about", "more than"). Prefer how things work and why, which you know well, over recent events, which you may not.
- Calibrate sentence length and complexity to the grade level.
- Make it genuinely interesting. Concrete details and examples throughout.
${OPENING_RULE}
- Short paragraphs (2-4 sentences each).
${ARTICLE_FORMAT}
- Age-appropriate for grade ${guide.grade} students.
- EDITORIAL NEUTRALITY: Report facts, not opinions.

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

/** Writes an article about the topic's story from the model's own knowledge (no source page) */
export async function writeFromKnowledge(client: Client, topic: SourcedTopic, opts?: WriterOptions): Promise<BaseArticle | null> {
  const response = await client.messages.create({
    ...request(opts),
    max_tokens: 4000,
    messages: [{ role: "user", content: knowledgePrompt(topic, opts?.guidance) }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  return parseRewrite(text(response), { ...topic, sourceUrl: null });
}

export function adaptPrompt(baseTitle: string, baseBody: string, targetLevel: number, guidance?: string): string {
  const guide = levelGuide[targetLevel];
  return `Adapt this article to reading level ${targetLevel} (Lexile ${guide.lexile}, Grade ${guide.grade}, ${guide.words} words). Keep same facts, adjust vocabulary/complexity.

${guide.vocab}
${guidanceLine(guidance)}
Title: ${baseTitle}
---
${baseBody}
---

Rules:
- Keep the same title (or simplify for lower levels)
- Keep all key facts accurate
- Adjust sentence length and vocabulary to match target grade
- Short paragraphs (2-4 sentences)
${ARTICLE_FORMAT}
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
    messages: [{ role: "user", content: adaptPrompt(baseTitle, baseBody, targetLevel, opts?.guidance) }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  return parseAdapt(text(response), baseTitle);
}

/**
 * A finished article measured well off its level's target (src/lib/reading-level.ts): the same
 * article again, with only its sentences and word choices changed as the measure advises.
 */
export function revisePrompt(title: string, body: string, advice: string[], guidance?: string): string {
  return `This article for a student came out at the wrong reading level. Rewrite it so it reads at the right one. Change only how it is written, never what it says.

WHAT TO CHANGE:
${advice.map(a => `- ${a}`).join("\n")}
${guidanceLine(guidance)}
Title: ${title}
---
${body}
---

Rules:
- Keep the same story, the same order and the same opening approach.
- Keep every fact, number, name and date exactly. Add no information and drop none that matters to the story.
- Keep about the same length.
- To lengthen sentences, join related ones; to shorten them, split them. Keep it natural: it must still read like a good article, not like an exercise.
- Short paragraphs (2-4 sentences).
${ARTICLE_FORMAT}

Output ONLY JSON:
{"title": "Article title", "body": "The rewritten article text."}`;
}

/** Rewrites an article once to bring it nearer its level; null when the model's answer can't be used */
export async function reviseArticle(
  client: Client, title: string, body: string, advice: string[], opts?: WriterOptions,
): Promise<{ title: string; bodyText: string } | null> {
  const response = await client.messages.create({
    ...request(opts),
    max_tokens: 4000,
    messages: [{ role: "user", content: revisePrompt(title, body, advice, opts?.guidance) }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const parsed = parseAdapt(text(response), title);
  return parsed ? { title: parsed.title, bodyText: parsed.bodyText } : null;
}
