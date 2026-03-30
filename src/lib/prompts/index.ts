import { interpolate } from "./interpolate";

// Static prompts
import interestInterviewMd from "./md/interest-interview.md";
import readingLevelAssessmentMd from "./md/reading-level-assessment.md";

// Simple templates
import articleGenerationMd from "./md/article-generation.md";
import batchPlannerMd from "./md/batch-planner.md";
import preReadingMd from "./md/pre-reading.md";
import wordDefinitionMd from "./md/word-definition.md";

// Comprehension conversation fragments
import conversationBaseMd from "./md/comprehension-conversation/base.md";
import levelContext1 from "./md/comprehension-conversation/level-context-1.md";
import levelContext2 from "./md/comprehension-conversation/level-context-2.md";
import levelContext3 from "./md/comprehension-conversation/level-context-3.md";
import levelContext4 from "./md/comprehension-conversation/level-context-4.md";
import levelContext5 from "./md/comprehension-conversation/level-context-5.md";
import levelContext6 from "./md/comprehension-conversation/level-context-6.md";
import styleOverviewThenDepth from "./md/comprehension-conversation/style-overview-then-depth.md";
import styleSurprise from "./md/comprehension-conversation/style-surprise.md";
import styleOpinion from "./md/comprehension-conversation/style-opinion.md";
import stylePerspectiveShift from "./md/comprehension-conversation/style-perspective-shift.md";
import styleDetailToBigPicture from "./md/comprehension-conversation/style-detail-to-big-picture.md";
import styleCreative from "./md/comprehension-conversation/style-creative.md";
import questionTypeLow from "./md/comprehension-conversation/question-type-low.md";
import questionTypeMid from "./md/comprehension-conversation/question-type-mid.md";
import questionTypeHigh from "./md/comprehension-conversation/question-type-high.md";
import sectionLiked from "./md/comprehension-conversation/section-liked.md";
import sectionDisliked from "./md/comprehension-conversation/section-disliked.md";

// Comprehension report fragments
import reportBaseMd from "./md/comprehension-report/base.md";
import levelExpectations1 from "./md/comprehension-report/level-expectations-1.md";
import levelExpectations2 from "./md/comprehension-report/level-expectations-2.md";
import levelExpectations3 from "./md/comprehension-report/level-expectations-3.md";
import levelExpectations4 from "./md/comprehension-report/level-expectations-4.md";
import levelExpectations5 from "./md/comprehension-report/level-expectations-5.md";
import levelExpectations6 from "./md/comprehension-report/level-expectations-6.md";

// --- Static exports ---

export const INTEREST_INTERVIEW = interestInterviewMd.trimEnd();
export const READING_LEVEL_ASSESSMENT = readingLevelAssessmentMd.trimEnd();

// --- Conversation styles ---

export const CONVERSATION_STYLES = [
  "OVERVIEW_THEN_DEPTH", "SURPRISE", "OPINION",
  "PERSPECTIVE_SHIFT", "DETAIL_TO_BIG_PICTURE", "CREATIVE"
] as const;

export function pickConversationStyle(): string {
  return CONVERSATION_STYLES[Math.floor(Math.random() * CONVERSATION_STYLES.length)];
}

// --- Lookup tables ---

const levelGuide: Record<number, { lexile: string; grade: string; words: string; vocab: string }> = {
  1: { lexile: "~400-500", grade: "2-3", words: "100-200", vocab: "Use simple, common words. Define any science/topic word in the same sentence. Max 1 challenging word per paragraph." },
  2: { lexile: "~550-650", grade: "3-4", words: "200-300", vocab: "Mostly common words. At most 1-2 topic-specific words per paragraph, explained in context." },
  3: { lexile: "~700-800", grade: "5-6", words: "300-400", vocab: "At most 2-3 challenging words per paragraph. Each one should be defined or contextually clear from surrounding text." },
  4: { lexile: "~850-950", grade: "7", words: "400-500", vocab: "Can use domain vocabulary with context clues. Avoid stacking multiple technical terms in one sentence." },
  5: { lexile: "~1000-1100", grade: "8", words: "400-600", vocab: "Domain-specific vocabulary is fine when supported by context. Complex sentence structures allowed." },
  6: { lexile: "~1150+", grade: "8+", words: "500-600", vocab: "Advanced vocabulary acceptable. Assume strong reader who can handle nuance and inference." },
};

const levelContextMap: Record<number, string> = {
  1: levelContext1.trimEnd(),
  2: levelContext2.trimEnd(),
  3: levelContext3.trimEnd(),
  4: levelContext4.trimEnd(),
  5: levelContext5.trimEnd(),
  6: levelContext6.trimEnd(),
};

const styleStepsMap: Record<string, string> = {
  OVERVIEW_THEN_DEPTH: styleOverviewThenDepth.trimEnd(),
  SURPRISE: styleSurprise.trimEnd(),
  OPINION: styleOpinion.trimEnd(),
  PERSPECTIVE_SHIFT: stylePerspectiveShift.trimEnd(),
  DETAIL_TO_BIG_PICTURE: styleDetailToBigPicture.trimEnd(),
  CREATIVE: styleCreative.trimEnd(),
};

const levelExpectationsMap: Record<number, string> = {
  1: levelExpectations1.trimEnd(),
  2: levelExpectations2.trimEnd(),
  3: levelExpectations3.trimEnd(),
  4: levelExpectations4.trimEnd(),
  5: levelExpectations5.trimEnd(),
  6: levelExpectations6.trimEnd(),
};

// --- Template functions ---

export function articleGenerationPrompt(level: number, topic: string, type: string) {
  const guide = levelGuide[level] || levelGuide[3];
  return interpolate(articleGenerationMd.trimEnd(), {
    level,
    topic,
    type,
    lexile: guide.lexile,
    grade: guide.grade,
    words: guide.words,
    vocab: guide.vocab,
    estimatedReadTime: level <= 2 ? 2 : level <= 4 ? 3 : 4,
  });
}

export function comprehensionConversationPrompt(
  articleText: string,
  level: number,
  interestProfile: string,
  previousArticles?: { title: string; topic: string }[],
  articleLiked?: boolean | null,
  fixedStyle?: string
) {
  const previousArticlesSection = previousArticles && previousArticles.length > 0
    ? "\nPrevious articles this student has read recently:\n" +
      previousArticles.map((a) => `- "${a.title}" (${a.topic})`).join("\n") +
      "\nIf a natural connection exists between the current article and a previous one, you may reference it. Only if the connection is genuine — don't force it.\n\n"
    : "";

  const likedSection = articleLiked === true
    ? sectionLiked.trimEnd() + "\n\n"
    : articleLiked === false
    ? sectionDisliked.trimEnd() + "\n\n"
    : "";

  const styleName = fixedStyle && styleStepsMap[fixedStyle]
    ? fixedStyle
    : CONVERSATION_STYLES[Math.floor(Math.random() * CONVERSATION_STYLES.length)];

  const questionTypeInstructions = level <= 2
    ? questionTypeLow.trimEnd()
    : level <= 4
    ? questionTypeMid.trimEnd()
    : questionTypeHigh.trimEnd();

  return interpolate(conversationBaseMd.trimEnd(), {
    levelContext: levelContextMap[level] || levelContextMap[3],
    likedSection,
    articleText,
    level,
    interestProfile,
    previousArticlesSection,
    styleName,
    styleSteps: styleStepsMap[styleName] || styleStepsMap.OVERVIEW_THEN_DEPTH,
    questionTypeInstructions,
    messageLengthRule: level <= 2 ? "One sentence, under 20 words." : level <= 4 ? "1-2 sentences max." : "2 sentences max.",
    messageLengthThreshold: level <= 2 ? "one sentence" : "two sentences",
  });
}

export function comprehensionReportPrompt(articleText: string, transcript: string, level: number) {
  return interpolate(reportBaseMd.trimEnd(), {
    articleText,
    transcript,
    level,
    levelExpectations: levelExpectationsMap[level] || levelExpectationsMap[3],
  });
}

export function batchPlannerPrompt(level: number, interests: string, existingTitles: string[], count: number) {
  return interpolate(batchPlannerMd.trimEnd(), {
    count,
    level,
    interests,
    existingTitles: existingTitles.join(", ") || "None",
  });
}

export function preReadingPrompt(title: string, topic: string, level: number) {
  return interpolate(preReadingMd.trimEnd(), { title, topic, level });
}

export function wordDefinitionPrompt(word: string, sentence: string) {
  return interpolate(wordDefinitionMd.trimEnd(), { word, sentence });
}
