import type Anthropic from "@anthropic-ai/sdk";

/**
 * Parse the JSON body of a structured-output response (output_config.format).
 * Returns null on a refusal, a max_tokens cut-off, or unparseable text.
 */
export function parseJsonResponse<T>(response: Anthropic.Message): T | null {
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
