/**
 * Which Claude model does each job, and how it is asked.
 * Update here when new model generations ship: every call site reads this file.
 * The choices and the tests behind them: docs/ai-models.md. Prices: ai-pricing.ts.
 */
export const MODELS = {
  /** The reading conversation (tutor turns) */
  tutor: "claude-sonnet-5-5",
  /** The comprehension report after each conversation; it moves the student's level */
  report: "claude-sonnet-5-5",
  /** Writing and level-adapting the shared articles (once per article, for every student) */
  writer: "claude-opus-5-5",
  /** Onboarding chat, coaching tip, word definitions, parent chat */
  standard: "claude-sonnet-5-5",
  /** Classification, picking, tagging, short summaries, web-search steps */
  light: "claude-haiku-5-5",
} as const;

export type ModelJob = keyof typeof MODELS;

/**
 * Request fields for a model on a job, spread into messages.create next to `model`.
 * Everything but article writing runs with thinking off: it adds seconds a child waits through,
 * can use up a small max_tokens, and in the tests it didn't make chat or reports better (the
 * report's scores sat closest to a reference grader with thinking off). Articles think.
 * (Claude Sonnet 5.5 turns thinking off with "between_tools"; "disabled" is rejected there.)
 */
export function requestSettings(model: string, job: ModelJob): object {
  return settingsFor(model, job);
}

function settingsFor(model: string, job: ModelJob): {
  thinking?: { type: "between_tools" | "disabled" };
  output_config?: { effort: "low" | "medium" | "high" };
} {
  const think = job === "writer";
  // Articles are written once for every student: medium effort measurably improved them (docs/ai-models.md)
  if (model.startsWith("claude-opus-5")) return { output_config: { effort: job === "writer" ? "medium" : "low" } };
  if (model.startsWith("claude-sonnet-5")) return think ? { output_config: { effort: "low" } } : { thinking: { type: "between_tools" } };
  if (model.startsWith("claude-haiku-5")) return think ? { output_config: { effort: "low" } } : { thinking: { type: "disabled" } };
  return {};
}

/**
 * `model` plus its settings for a job, merged into a request body. Keeps any output_config the
 * caller sets (a JSON schema format) alongside the effort.
 */
export function forJob<const B extends object>(job: ModelJob, body: B, model: string = MODELS[job]): B & { model: string } {
  const settings = settingsFor(model, job);
  const own = (body as { output_config?: Record<string, unknown> }).output_config;
  const outputConfig = { ...(settings.output_config ?? {}), ...(own ?? {}) };
  // Typed as the caller's body: the SDK's types may not list newer thinking modes yet
  return {
    ...body,
    model,
    ...(settings.thinking ? { thinking: settings.thinking } : {}),
    ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
  } as B & { model: string };
}
