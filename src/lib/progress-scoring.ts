/**
 * Progress scoring logic for conversation completion gating.
 * Pure functions — no DB or API dependencies — easy to test.
 */

/** Clamp a progressDelta to the valid range [0, 40]. */
export function clampDelta(delta: number): number {
  return Math.max(0, Math.min(40, delta));
}

/** Parse the AI model's JSON response to extract message and progressDelta. */
export function parseProgressResponse(assistantText: string): {
  message: string;
  progressDelta: number;
} {
  try {
    const jsonMatch = assistantText.match(
      /\{[\s\S]*"message"[\s\S]*"progressDelta"[\s\S]*\}/
    );
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        message: parsed.message,
        progressDelta: parsed.progressDelta,
      };
    }
  } catch {
    // Fall through to fallback
  }
  return { message: assistantText, progressDelta: 0 };
}

/** Determine if the conversation should be marked complete. */
export function isConversationComplete({
  progressScore,
  exchangeNumber,
  forceComplete,
}: {
  progressScore: number;
  exchangeNumber: number;
  forceComplete: boolean;
}): boolean {
  if (forceComplete) return true;
  return progressScore >= 100 && exchangeNumber >= 3;
}
