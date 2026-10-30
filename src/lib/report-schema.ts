/**
 * JSON schemas for structured outputs (output_config.format) on conversation turns and
 * comprehension reports, plus the pure helpers that go with them.
 */

/** Bump when comprehension-report/base.md changes, so reports can be compared by prompt version. */
export const REPORT_PROMPT_VERSION = "report-v2";

export const SKILLS = ["main_idea", "key_details", "vocabulary", "inference", "connection"] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_RATINGS = ["shown", "partly", "not_shown", "not_tested"] as const;
export type SkillRating = (typeof SKILL_RATINGS)[number];

export const RATINGS = ["Exceptional", "Strong", "Solid", "Developing", "Struggled"] as const;

/** One tutor turn: the message shown to the student and the progress it earned. */
export const REPLY_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    progressDelta: { type: "integer" },
  },
  required: ["message", "progressDelta"],
  additionalProperties: false,
} as const;

const skillRating = { type: "string", enum: [...SKILL_RATINGS] };

export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer" },
    rating: { type: "string", enum: [...RATINGS] },
    comprehension: { type: "string" },
    depth: { type: "string" },
    engagement: { type: "string" },
    skills: {
      type: "object",
      properties: Object.fromEntries(SKILLS.map(s => [s, skillRating])),
      required: [...SKILLS],
      additionalProperties: false,
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          skill: { type: "string", enum: [...SKILLS] },
          quote: { type: "string" },
        },
        required: ["skill", "quote"],
        additionalProperties: false,
      },
    },
    summary: { type: "string" },
    nextStep: { type: "string" },
  },
  required: ["score", "rating", "comprehension", "depth", "engagement", "skills", "evidence", "summary", "nextStep"],
  additionalProperties: false,
} as const;

export interface ComprehensionReport {
  score: number;
  rating: (typeof RATINGS)[number];
  comprehension: string;
  depth: string;
  engagement: string;
  skills: Record<Skill, SkillRating>;
  evidence: { skill: Skill; quote: string }[];
  summary: string;
  nextStep: string;
}

export type ReportConfidence = "high" | "medium" | "low";

/**
 * How much a guide should trust a report, from the shape of the conversation:
 * a forced close, too few exchanges, or very short answers give the report little to go on.
 */
export function reportConfidence(c: { forcedClose: boolean; exchangeCount: number; studentAvgWords: number }): ReportConfidence {
  if (c.forcedClose || c.exchangeCount < 3 || c.studentAvgWords < 4) return "low";
  if (c.studentAvgWords >= 8) return "high";
  return "medium";
}

/** Clamp a model-provided score into 1-100. */
export function clampScore(score: number): number {
  return Math.max(1, Math.min(100, Math.round(score)));
}
