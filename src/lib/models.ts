/**
 * Centralized model configuration.
 * Update here when new model generations ship — all routes pull from this file.
 */
export const MODELS = {
  /** Comprehension conversations, report generation — highest quality */
  heavy: "claude-opus-4-6",
  /** Article generation, definitions, onboarding, parent chat */
  standard: "claude-sonnet-4-6",
  /** Summaries, feed events, batch planning — fast and cheap */
  light: "claude-haiku-4-5",
} as const;
